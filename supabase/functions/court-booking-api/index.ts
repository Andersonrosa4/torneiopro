import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ═══════════════════════════════════════
    // Helper: get authenticated arena admin
    // ═══════════════════════════════════════
    async function getArenaAdmin(authHeader: string | null) {
      if (!authHeader) return null;
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      if (!user) return null;

      // Check if user is an arena admin
      const { data: adminData } = await supabase
        .from("arena_admins")
        .select("id, arena_id, user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (adminData) return { ...adminData, authUserId: user.id, isAppAdmin: false };

      // Check if user is an app-level admin (master)
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (roleData) {
        // App admin: get first arena (or null if none exist)
        const { data: firstArena } = await supabase
          .from("arenas")
          .select("id")
          .order("created_at")
          .limit(1)
          .maybeSingle();

        return {
          id: "app-admin",
          arena_id: firstArena?.id || null,
          user_id: user.id,
          authUserId: user.id,
          isAppAdmin: true,
        };
      }

      return null;
    }

    const authHeader = req.headers.get("authorization");

    // ═══════════════════════════════════════
    // PUBLIC ACTIONS (no auth required)
    // ═══════════════════════════════════════

    if (action === "list_states") {
      const { data, error } = await supabase
        .from("states")
        .select("id, name, uf")
        .order("name");
      if (error) return errorResponse(error.message);
      return jsonResponse({ data });
    }

    if (action === "list_cities") {
      const { state_id } = body;
      if (!state_id) return errorResponse("state_id é obrigatório");
      const { data, error } = await supabase
        .from("cities")
        .select("id, name")
        .eq("state_id", state_id)
        .order("name");
      if (error) return errorResponse(error.message);
      return jsonResponse({ data });
    }

    if (action === "list_arenas") {
      const { state_id, city_id } = body;
      let q = supabase
        .from("arenas")
        .select("id, name, address, phone, whatsapp, opening_time, closing_time, logo_url, state_id, city_id")
        .eq("active", true);
      if (state_id) q = q.eq("state_id", state_id);
      if (city_id) q = q.eq("city_id", city_id);
      const { data, error } = await q.order("name");
      if (error) return errorResponse(error.message);
      return jsonResponse({ data });
    }

    if (action === "list_courts") {
      const { arena_id } = body;
      if (!arena_id) return errorResponse("arena_id é obrigatório");
      const { data, error } = await supabase
        .from("courts")
        .select("id, name, sport_type, surface_type, slot_duration_minutes, price_per_slot")
        .eq("arena_id", arena_id)
        .eq("active", true)
        .order("name");
      if (error) return errorResponse(error.message);
      return jsonResponse({ data });
    }

    if (action === "list_available_slots") {
      const { court_id, date } = body;
      if (!court_id || !date) return errorResponse("court_id e date são obrigatórios");

      // Get available time slots
      const { data: slots, error: slotsErr } = await supabase
        .from("court_time_slots")
        .select("id, start_time, end_time, status")
        .eq("court_id", court_id)
        .eq("date", date)
        .eq("status", "available")
        .order("start_time");
      if (slotsErr) return errorResponse(slotsErr.message);

      // Get existing bookings for this date/court to filter out booked slots
      const { data: bookings, error: bookErr } = await supabase
        .from("court_bookings")
        .select("start_time, end_time")
        .eq("court_id", court_id)
        .eq("date", date)
        .in("status", ["reserved", "finished"]);
      if (bookErr) return errorResponse(bookErr.message);

      // Filter out slots that have active bookings
      const available = (slots || []).filter((slot: any) => {
        return !(bookings || []).some((b: any) =>
          b.start_time === slot.start_time && b.end_time === slot.end_time
        );
      });

      return jsonResponse({ data: available });
    }

    if (action === "find_or_create_customer") {
      const { name, cpf, phone, state_id, city_id } = body;
      if (!name || !cpf || !phone) return errorResponse("name, cpf e phone são obrigatórios");

      // Sanitize CPF: only digits
      const cleanCpf = cpf.replace(/\D/g, "");
      if (cleanCpf.length !== 11) return errorResponse("CPF inválido");

      // Try to find existing customer
      const { data: existing } = await supabase
        .from("customers")
        .select("id, name, cpf, phone")
        .eq("cpf", cleanCpf)
        .maybeSingle();

      if (existing) {
        // Check wallet balance
        const { data: wallet } = await supabase
          .from("customer_wallet")
          .select("balance")
          .eq("customer_id", existing.id)
          .maybeSingle();

        if (wallet && wallet.balance < 0) {
          return errorResponse("Cliente com saldo negativo. Quite sua dívida antes de agendar.", 403);
        }
        return jsonResponse({ data: existing });
      }

      // Create new customer
      const { data: newCustomer, error: createErr } = await supabase
        .from("customers")
        .insert({ name: name.trim(), cpf: cleanCpf, phone: phone.trim(), state_id, city_id })
        .select("id, name, cpf, phone")
        .single();

      if (createErr) return errorResponse(createErr.message);
      return jsonResponse({ data: newCustomer });
    }

    if (action === "create_booking") {
      const { arena_id, court_id, customer_id, date, start_time, end_time, payment_method, price } = body;
      if (!arena_id || !court_id || !customer_id || !date || !start_time || !end_time) {
        return errorResponse("Todos os campos são obrigatórios");
      }

      // 1) Check wallet balance
      const { data: wallet } = await supabase
        .from("customer_wallet")
        .select("balance")
        .eq("customer_id", customer_id)
        .maybeSingle();

      if (wallet && wallet.balance < 0) {
        return errorResponse("Cliente com saldo negativo. Quite sua dívida antes de agendar.", 403);
      }

      // 2) Check for conflicts
      const { data: conflicts } = await supabase
        .from("court_bookings")
        .select("id")
        .eq("court_id", court_id)
        .eq("date", date)
        .eq("start_time", start_time)
        .eq("end_time", end_time)
        .in("status", ["reserved", "finished"]);

      if (conflicts && conflicts.length > 0) {
        return errorResponse("Horário já reservado");
      }

      // 3) Create booking
      const bookingPrice = price || 0;
      const { data: booking, error: bookErr } = await supabase
        .from("court_bookings")
        .insert({
          arena_id, court_id, customer_id, date, start_time, end_time,
          status: "reserved", payment_status: "pending", price: bookingPrice, penalty_value: 0,
        })
        .select()
        .single();

      if (bookErr) {
        if (bookErr.message.includes("duplicate") || bookErr.message.includes("unique")) {
          return errorResponse("Horário já reservado");
        }
        return errorResponse(bookErr.message);
      }

      // 4) Create pending payment
      await supabase.from("payments").insert({
        booking_id: booking.id,
        method: payment_method || "cash",
        amount: bookingPrice,
        status: "pending",
      });

      // 5) Block the time slot
      await supabase
        .from("court_time_slots")
        .update({ status: "blocked" })
        .eq("court_id", court_id)
        .eq("date", date)
        .eq("start_time", start_time)
        .eq("end_time", end_time);

      return jsonResponse({ data: booking });
    }

    // ═══════════════════════════════════════
    // ARENA ADMIN ACTIONS (auth required)
    // ═══════════════════════════════════════

    const admin = await getArenaAdmin(authHeader);

    if (action === "arena_login_check") {
      if (!admin) return errorResponse("Não autenticado como admin de arena", 401);

      // App admin without any arena yet
      if (admin.isAppAdmin && !admin.arena_id) {
        return jsonResponse({ data: { admin, arena: null, isAppAdmin: true } });
      }

      const { data: arena } = await supabase
        .from("arenas")
        .select("id, name, address, opening_time, closing_time, working_days, cancel_policy_hours")
        .eq("id", admin.arena_id)
        .single();
      return jsonResponse({ data: { admin, arena, isAppAdmin: admin.isAppAdmin || false } });
    }

    if (action === "create_time_slots") {
      if (!admin) return errorResponse("Autenticação de arena necessária", 401);
      const { court_id, date, slots } = body;
      if (!court_id || !date || !slots || !Array.isArray(slots)) {
        return errorResponse("court_id, date e slots são obrigatórios");
      }

      // Verify court belongs to admin's arena
      const { data: court } = await supabase
        .from("courts")
        .select("arena_id")
        .eq("id", court_id)
        .single();
      if (!court || court.arena_id !== admin.arena_id) {
        return errorResponse("Quadra não pertence à sua arena", 403);
      }

      const insertData = slots.map((s: { start_time: string; end_time: string }) => ({
        court_id, date, start_time: s.start_time, end_time: s.end_time, status: "available",
      }));

      const { data, error } = await supabase
        .from("court_time_slots")
        .upsert(insertData, { onConflict: "court_id,date,start_time,end_time" })
        .select();

      if (error) return errorResponse(error.message);
      return jsonResponse({ data });
    }

    if (action === "block_slot") {
      if (!admin) return errorResponse("Autenticação de arena necessária", 401);
      const { slot_id } = body;
      if (!slot_id) return errorResponse("slot_id é obrigatório");

      const { error } = await supabase
        .from("court_time_slots")
        .update({ status: "blocked" })
        .eq("id", slot_id);
      if (error) return errorResponse(error.message);
      return jsonResponse({ data: null });
    }

    if (action === "unblock_slot") {
      if (!admin) return errorResponse("Autenticação de arena necessária", 401);
      const { slot_id } = body;
      if (!slot_id) return errorResponse("slot_id é obrigatório");

      const { error } = await supabase
        .from("court_time_slots")
        .update({ status: "available" })
        .eq("id", slot_id);
      if (error) return errorResponse(error.message);
      return jsonResponse({ data: null });
    }

    if (action === "list_bookings") {
      if (!admin) return errorResponse("Autenticação de arena necessária", 401);
      const { date, status } = body;

      let q = supabase
        .from("court_bookings")
        .select("*, customers(name, cpf, phone), courts(name), payments(id, method, amount, status)")
        .order("date", { ascending: false })
        .order("start_time");

      // Arena admin sees only their arena; app admin sees all (or filtered by arena_id if set)
      if (!admin.isAppAdmin && admin.arena_id) {
        q = q.eq("arena_id", admin.arena_id);
      } else if (admin.arena_id) {
        q = q.eq("arena_id", admin.arena_id);
      }

      if (date) q = q.eq("date", date);
      if (status) q = q.eq("status", status);

      const { data, error } = await q;
      if (error) return errorResponse(error.message);
      return jsonResponse({ data });
    }

    if (action === "mark_no_show") {
      if (!admin) return errorResponse("Autenticação de arena necessária", 401);
      const { booking_id, penalty_value } = body;
      if (!booking_id) return errorResponse("booking_id é obrigatório");

      // Get booking
      const { data: booking } = await supabase
        .from("court_bookings")
        .select("id, customer_id, price, arena_id")
        .eq("id", booking_id)
        .single();

      if (!booking || (!admin.isAppAdmin && booking.arena_id !== admin.arena_id)) {
        return errorResponse("Reserva não encontrada", 404);
      }

      const totalDebt = (booking.price || 0) + (penalty_value || 0);

      // Update booking status
      await supabase
        .from("court_bookings")
        .update({
          status: "no_show",
          payment_status: "debt",
          penalty_value: penalty_value || 0,
        })
        .eq("id", booking_id);

      // Add debt to wallet (negative balance)
      await supabase.rpc("", {}).catch(() => {}); // no-op, do manually

      // Update wallet balance
      const { data: wallet } = await supabase
        .from("customer_wallet")
        .select("balance")
        .eq("customer_id", booking.customer_id)
        .single();

      const newBalance = (wallet?.balance || 0) - totalDebt;
      await supabase
        .from("customer_wallet")
        .update({ balance: newBalance, updated_at: new Date().toISOString() })
        .eq("customer_id", booking.customer_id);

      // Log transaction
      await supabase.from("wallet_transactions").insert({
        customer_id: booking.customer_id,
        type: "penalty",
        description: `No-show: R$ ${booking.price} + multa R$ ${penalty_value || 0}`,
        amount: -totalDebt,
      });

      return jsonResponse({ data: { newBalance } });
    }

    if (action === "cancel_booking") {
      if (!admin) return errorResponse("Autenticação de arena necessária", 401);
      const { booking_id, apply_penalty, penalty_value } = body;
      if (!booking_id) return errorResponse("booking_id é obrigatório");

      const { data: booking } = await supabase
        .from("court_bookings")
        .select("id, customer_id, court_id, date, start_time, end_time, price, arena_id")
        .eq("id", booking_id)
        .single();

      if (!booking || (!admin.isAppAdmin && booking.arena_id !== admin.arena_id)) {
        return errorResponse("Reserva não encontrada", 404);
      }

      // Update booking
      await supabase
        .from("court_bookings")
        .update({
          status: "canceled",
          penalty_value: apply_penalty ? (penalty_value || 0) : 0,
          payment_status: apply_penalty ? "debt" : "pending",
        })
        .eq("id", booking_id);

      // Release time slot
      await supabase
        .from("court_time_slots")
        .update({ status: "available" })
        .eq("court_id", booking.court_id)
        .eq("date", booking.date)
        .eq("start_time", booking.start_time)
        .eq("end_time", booking.end_time);

      // If penalty, update wallet
      if (apply_penalty && penalty_value) {
        const { data: wallet } = await supabase
          .from("customer_wallet")
          .select("balance")
          .eq("customer_id", booking.customer_id)
          .single();

        const newBalance = (wallet?.balance || 0) - penalty_value;
        await supabase
          .from("customer_wallet")
          .update({ balance: newBalance, updated_at: new Date().toISOString() })
          .eq("customer_id", booking.customer_id);

        await supabase.from("wallet_transactions").insert({
          customer_id: booking.customer_id,
          type: "penalty",
          description: `Cancelamento tardio: multa R$ ${penalty_value}`,
          amount: -penalty_value,
        });
      }

      return jsonResponse({ data: null });
    }

    if (action === "mark_finished") {
      if (!admin) return errorResponse("Autenticação de arena necessária", 401);
      const { booking_id } = body;
      if (!booking_id) return errorResponse("booking_id é obrigatório");

      let q = supabase
        .from("court_bookings")
        .update({ status: "finished" })
        .eq("id", booking_id);
      if (!admin.isAppAdmin && admin.arena_id) q = q.eq("arena_id", admin.arena_id);
      await q;

      return jsonResponse({ data: null });
    }

    if (action === "register_payment") {
      if (!admin) return errorResponse("Autenticação de arena necessária", 401);
      const { booking_id, method, amount } = body;
      if (!booking_id || !method || !amount) {
        return errorResponse("booking_id, method e amount são obrigatórios");
      }

      const { data: booking } = await supabase
        .from("court_bookings")
        .select("id, customer_id, arena_id, price")
        .eq("id", booking_id)
        .single();

      if (!booking || (!admin.isAppAdmin && booking.arena_id !== admin.arena_id)) {
        return errorResponse("Reserva não encontrada", 404);
      }

      // Update payment
      await supabase
        .from("payments")
        .update({ status: "paid", method })
        .eq("booking_id", booking_id);

      // Update booking payment status
      await supabase
        .from("court_bookings")
        .update({ payment_status: "paid" })
        .eq("id", booking_id);

      // Credit wallet if there was a debt
      const { data: wallet } = await supabase
        .from("customer_wallet")
        .select("balance")
        .eq("customer_id", booking.customer_id)
        .single();

      if (wallet && wallet.balance < 0) {
        const newBalance = wallet.balance + amount;
        await supabase
          .from("customer_wallet")
          .update({ balance: newBalance, updated_at: new Date().toISOString() })
          .eq("customer_id", booking.customer_id);

        await supabase.from("wallet_transactions").insert({
          customer_id: booking.customer_id,
          type: "payment",
          description: `Pagamento via ${method}: R$ ${amount}`,
          amount: amount,
        });
      }

      return jsonResponse({ data: null });
    }

    if (action === "list_all_slots") {
      if (!admin) return errorResponse("Autenticação de arena necessária", 401);
      const { court_id, date } = body;
      if (!court_id || !date) return errorResponse("court_id e date são obrigatórios");

      const { data, error } = await supabase
        .from("court_time_slots")
        .select("id, start_time, end_time, status")
        .eq("court_id", court_id)
        .eq("date", date)
        .order("start_time");
      if (error) return errorResponse(error.message);
      return jsonResponse({ data });
    }

    if (action === "get_customer_wallet") {
      const { cpf } = body;
      if (!cpf) return errorResponse("cpf é obrigatório");
      const cleanCpf = cpf.replace(/\D/g, "");

      const { data: customer } = await supabase
        .from("customers")
        .select("id, name, cpf")
        .eq("cpf", cleanCpf)
        .maybeSingle();

      if (!customer) return errorResponse("Cliente não encontrado", 404);

      const { data: wallet } = await supabase
        .from("customer_wallet")
        .select("balance")
        .eq("customer_id", customer.id)
        .maybeSingle();

      const { data: transactions } = await supabase
        .from("wallet_transactions")
        .select("*")
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false })
        .limit(20);

      return jsonResponse({
        data: {
          customer,
          balance: wallet?.balance || 0,
          transactions: transactions || [],
        },
      });
    }

    // ═══════════════════════════════════════
    // ARENA CRUD (admin only)
    // ═══════════════════════════════════════

    if (action === "create_arena") {
      if (!admin) return errorResponse("Autenticação necessária", 401);
      // Check if user is app admin
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: admin.authUserId, _role: "admin" });
      const isArenaAdmin = !!admin.arena_id;
      if (!isAdmin && !isArenaAdmin) return errorResponse("Sem permissão", 403);

      const { name, address, phone, whatsapp, state_id, city_id, opening_time, closing_time, working_days, cancel_policy_hours, description } = body;
      if (!name || !state_id || !city_id) return errorResponse("name, state_id e city_id são obrigatórios");

      const { data: newArena, error: createErr } = await supabase
        .from("arenas")
        .insert({
          name: name.trim(),
          address: address || null,
          phone: phone || null,
          whatsapp: whatsapp || null,
          state_id,
          city_id,
          opening_time: opening_time || "08:00",
          closing_time: closing_time || "22:00",
          working_days: working_days || "mon,tue,wed,thu,fri,sat,sun",
          cancel_policy_hours: cancel_policy_hours || 2,
          description: description || null,
        })
        .select()
        .single();

      if (createErr) return errorResponse(createErr.message);
      return jsonResponse({ data: newArena });
    }

    if (action === "update_arena") {
      if (!admin) return errorResponse("Autenticação necessária", 401);
      const { arena_id: targetArenaId, ...updates } = body;
      const arenaIdToUpdate = targetArenaId || admin.arena_id;
      if (!arenaIdToUpdate) return errorResponse("arena_id é obrigatório");

      // Only allow updating own arena or if app admin
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: admin.authUserId, _role: "admin" });
      if (arenaIdToUpdate !== admin.arena_id && !isAdmin) {
        return errorResponse("Sem permissão", 403);
      }

      const allowedFields = ["name", "address", "phone", "whatsapp", "opening_time", "closing_time", "working_days", "cancel_policy_hours", "description", "active", "logo_url"];
      const updateData: Record<string, any> = {};
      for (const key of allowedFields) {
        if (updates[key] !== undefined) updateData[key] = updates[key];
      }

      const { data, error } = await supabase
        .from("arenas")
        .update(updateData)
        .eq("id", arenaIdToUpdate)
        .select()
        .single();

      if (error) return errorResponse(error.message);
      return jsonResponse({ data });
    }

    if (action === "list_admin_arenas") {
      if (!admin) return errorResponse("Autenticação necessária", 401);
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: admin.authUserId, _role: "admin" });

      let q = supabase
        .from("arenas")
        .select("*, states(name, uf), cities(name)")
        .order("name");

      if (!isAdmin) {
        q = q.eq("id", admin.arena_id);
      }

      const { data, error } = await q;
      if (error) return errorResponse(error.message);
      return jsonResponse({ data });
    }

    if (action === "create_arena_admin") {
      if (!admin) return errorResponse("Autenticação necessária", 401);
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: admin.authUserId, _role: "admin" });
      if (!isAdmin) return errorResponse("Apenas admins do app podem vincular admins de arena", 403);

      const { user_id: targetUserId, arena_id: targetArenaId } = body;
      if (!targetUserId || !targetArenaId) return errorResponse("user_id e arena_id são obrigatórios");

      const { data, error } = await supabase
        .from("arena_admins")
        .insert({ user_id: targetUserId, arena_id: targetArenaId })
        .select()
        .single();

      if (error) return errorResponse(error.message);
      return jsonResponse({ data });
    }

    if (action === "create_court") {
      if (!admin) return errorResponse("Autenticação necessária", 401);
      const { arena_id: targetArenaId, name, sport_type, surface_type, slot_duration_minutes, price_per_slot } = body;
      const arenaId = targetArenaId || admin.arena_id;

      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: admin.authUserId, _role: "admin" });
      if (arenaId !== admin.arena_id && !isAdmin) return errorResponse("Sem permissão", 403);

      if (!name) return errorResponse("name é obrigatório");

      const { data, error } = await supabase
        .from("courts")
        .insert({
          arena_id: arenaId,
          name: name.trim(),
          sport_type: sport_type || "beach_tennis",
          surface_type: surface_type || "sand",
          slot_duration_minutes: slot_duration_minutes || 60,
          price_per_slot: price_per_slot || 0,
        })
        .select()
        .single();

      if (error) return errorResponse(error.message);
      return jsonResponse({ data });
    }

    if (action === "update_court") {
      if (!admin) return errorResponse("Autenticação necessária", 401);
      const { court_id, ...updates } = body;
      if (!court_id) return errorResponse("court_id é obrigatório");

      const { data: court } = await supabase.from("courts").select("arena_id").eq("id", court_id).single();
      if (!court) return errorResponse("Quadra não encontrada", 404);

      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: admin.authUserId, _role: "admin" });
      if (court.arena_id !== admin.arena_id && !isAdmin) return errorResponse("Sem permissão", 403);

      const allowedFields = ["name", "sport_type", "surface_type", "slot_duration_minutes", "price_per_slot", "active"];
      const updateData: Record<string, any> = {};
      for (const key of allowedFields) {
        if (updates[key] !== undefined) updateData[key] = updates[key];
      }

      const { data, error } = await supabase
        .from("courts")
        .update(updateData)
        .eq("id", court_id)
        .select()
        .single();

      if (error) return errorResponse(error.message);
      return jsonResponse({ data });
    }

    // ═══════════════════════════════════════
    // ATHLETE ACTIONS
    // ═══════════════════════════════════════

    if (action === "list_athlete_bookings") {
      const { user_id } = body;
      if (!user_id) return errorResponse("user_id é obrigatório");

      // Find customer by user metadata (cpf)
      // First get user info
      const token = authHeader?.replace("Bearer ", "");
      if (!token) return errorResponse("Autenticação necessária", 401);
      const { data: { user: authUser } } = await supabase.auth.getUser(token);
      if (!authUser || authUser.id !== user_id) return errorResponse("Não autorizado", 401);

      const cpf = authUser.user_metadata?.cpf;
      if (!cpf) return errorResponse("CPF não encontrado no perfil");

      const { data: customer } = await supabase
        .from("customers")
        .select("id")
        .eq("cpf", cpf)
        .maybeSingle();

      if (!customer) return jsonResponse({ data: [] });

      const { data: bookings, error: bErr } = await supabase
        .from("court_bookings")
        .select("id, date, start_time, end_time, status, price, courts(name), arenas:arena_id(name)")
        .eq("customer_id", customer.id)
        .order("date", { ascending: false })
        .order("start_time", { ascending: false })
        .limit(50);

      if (bErr) return errorResponse(bErr.message);

      const mapped = (bookings || []).map((b: any) => ({
        id: b.id,
        date: b.date,
        start_time: b.start_time,
        end_time: b.end_time,
        status: b.status,
        price: b.price,
        court_name: b.courts?.name || "—",
        arena_name: b.arenas?.name || "—",
      }));

      return jsonResponse({ data: mapped });
    }

    if (action === "cancel_athlete_booking") {
      const token = authHeader?.replace("Bearer ", "");
      if (!token) return errorResponse("Autenticação necessária", 401);
      const { data: { user: authUser } } = await supabase.auth.getUser(token);
      if (!authUser) return errorResponse("Não autorizado", 401);

      const { booking_id } = body;
      if (!booking_id) return errorResponse("booking_id é obrigatório");

      const cpf = authUser.user_metadata?.cpf;
      if (!cpf) return errorResponse("CPF não encontrado no perfil");

      const { data: customer } = await supabase
        .from("customers")
        .select("id")
        .eq("cpf", cpf)
        .maybeSingle();
      if (!customer) return errorResponse("Cliente não encontrado", 404);

      const { data: booking } = await supabase
        .from("court_bookings")
        .select("id, customer_id, court_id, date, start_time, end_time, status")
        .eq("id", booking_id)
        .single();

      if (!booking) return errorResponse("Reserva não encontrada", 404);
      if (booking.customer_id !== customer.id) return errorResponse("Sem permissão", 403);
      if (booking.status !== "reserved") return errorResponse("Apenas reservas confirmadas podem ser canceladas");

      // Check 2-hour rule
      const now = new Date();
      const bookingDateTime = new Date(`${booking.date}T${booking.start_time}`);
      const diffMs = bookingDateTime.getTime() - now.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      if (diffHours <= 2) {
        return errorResponse("Cancelamento permitido apenas com mais de 2 horas de antecedência");
      }

      // Cancel booking
      await supabase
        .from("court_bookings")
        .update({ status: "canceled" })
        .eq("id", booking_id);

      // Release time slot
      await supabase
        .from("court_time_slots")
        .update({ status: "available" })
        .eq("court_id", booking.court_id)
        .eq("date", booking.date)
        .eq("start_time", booking.start_time)
        .eq("end_time", booking.end_time);

      return jsonResponse({ data: null });
    }

    if (action === "list_arena_owners") {
      const token = authHeader?.replace("Bearer ", "");
      if (!token) return errorResponse("Autenticação necessária", 401);
      const { data: { user: authUser } } = await supabase.auth.getUser(token);
      if (!authUser) return errorResponse("Não autorizado", 401);

      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: authUser.id, _role: "admin" });
      if (!isAdmin) return errorResponse("Apenas admins", 403);

      const { data: admins, error: aErr } = await supabase
        .from("arena_admins")
        .select("id, user_id, arena_id, created_at, arenas(name)")
        .order("created_at", { ascending: false });

      if (aErr) return errorResponse(aErr.message);

      // Get user emails
      const result = [];
      for (const a of (admins || [])) {
        const { data: { user: u } } = await supabase.auth.admin.getUserById(a.user_id);
        result.push({
          ...a,
          user_email: u?.email || a.user_id,
          arena_name: (a as any).arenas?.name || a.arena_id,
        });
      }

      return jsonResponse({ data: result });
    }

    if (action === "create_arena_owner") {
      const token = authHeader?.replace("Bearer ", "");
      if (!token) return errorResponse("Autenticação necessária", 401);
      const { data: { user: authUser } } = await supabase.auth.getUser(token);
      if (!authUser) return errorResponse("Não autorizado", 401);

      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: authUser.id, _role: "admin" });
      if (!isAdmin) return errorResponse("Apenas admins", 403);

      const { email, password, arena_id } = body;
      if (!email || !password || !arena_id) return errorResponse("email, password e arena_id são obrigatórios");

      // Create auth user with auto-confirm
      const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createErr) return errorResponse(createErr.message);

      // Create arena_admin record
      const { data: adminRec, error: adminErr } = await supabase
        .from("arena_admins")
        .insert({ user_id: newUser.user.id, arena_id })
        .select()
        .single();
      if (adminErr) return errorResponse(adminErr.message);

      return jsonResponse({ data: adminRec });
    }

    if (action === "remove_arena_owner") {
      const token = authHeader?.replace("Bearer ", "");
      if (!token) return errorResponse("Autenticação necessária", 401);
      const { data: { user: authUser } } = await supabase.auth.getUser(token);
      if (!authUser) return errorResponse("Não autorizado", 401);

      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: authUser.id, _role: "admin" });
      if (!isAdmin) return errorResponse("Apenas admins", 403);

      const { owner_id } = body;
      if (!owner_id) return errorResponse("owner_id é obrigatório");

      const { error } = await supabase
        .from("arena_admins")
        .delete()
        .eq("id", owner_id);
      if (error) return errorResponse(error.message);

      return jsonResponse({ data: null });
    }

    return errorResponse("Ação não reconhecida: " + action);
  } catch (err) {
    return jsonResponse({ error: "Erro interno: " + (err as Error).message }, 500);
  }
});

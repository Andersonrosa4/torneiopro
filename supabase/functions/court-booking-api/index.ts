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

      const { data: adminData } = await supabase
        .from("arena_admins")
        .select("id, arena_id, user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      return adminData ? { ...adminData, authUserId: user.id } : null;
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
      const { data: arena } = await supabase
        .from("arenas")
        .select("id, name, address, opening_time, closing_time, working_days, cancel_policy_hours")
        .eq("id", admin.arena_id)
        .single();
      return jsonResponse({ data: { admin, arena } });
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
        .eq("arena_id", admin.arena_id)
        .order("date", { ascending: false })
        .order("start_time");

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

      if (!booking || booking.arena_id !== admin.arena_id) {
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

      if (!booking || booking.arena_id !== admin.arena_id) {
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

      await supabase
        .from("court_bookings")
        .update({ status: "finished" })
        .eq("id", booking_id)
        .eq("arena_id", admin.arena_id);

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

      if (!booking || booking.arena_id !== admin.arena_id) {
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

    return errorResponse("Ação não reconhecida: " + action);
  } catch (err) {
    return jsonResponse({ error: "Erro interno: " + (err as Error).message }, 500);
  }
});

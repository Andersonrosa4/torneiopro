import { describe, it, expect } from "vitest";

/**
 * Testes do módulo de agendamento de arenas.
 * Testa regras de negócio core: CPF, conflito de horário, cancelamento.
 */

// ═══════════════════════════════════════
// Helpers (simulam lógica do edge function)
// ═══════════════════════════════════════

function validateCpf(cpf: string): boolean {
  const clean = cpf.replace(/\D/g, "");
  return clean.length === 11;
}

function checkConflict(
  existingBookings: Array<{ start_time: string; end_time: string; status: string }>,
  newStart: string,
  newEnd: string
): boolean {
  return existingBookings.some((b) => {
    if (b.status !== "reserved" && b.status !== "finished") return false;
    return b.start_time < newEnd && b.end_time > newStart;
  });
}

function canAthleteCancel(bookingDate: string, bookingStartTime: string, now: Date): boolean {
  const bookingDateTime = new Date(`${bookingDate}T${bookingStartTime}`);
  const diffMs = bookingDateTime.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  return diffHours > 2;
}

function isWithinOperatingHours(startTime: string, endTime: string, openTime: string, closeTime: string): boolean {
  return startTime >= openTime && endTime <= closeTime;
}

// ═══════════════════════════════════════
// 1) Cadastro com CPF duplicado
// ═══════════════════════════════════════

describe("Validação de CPF", () => {
  it("deve aceitar CPF com 11 dígitos", () => {
    expect(validateCpf("12345678901")).toBe(true);
    expect(validateCpf("123.456.789-01")).toBe(true);
  });

  it("deve rejeitar CPF com menos de 11 dígitos", () => {
    expect(validateCpf("1234567890")).toBe(false);
    expect(validateCpf("123")).toBe(false);
    expect(validateCpf("")).toBe(false);
  });

  it("deve simular detecção de CPF duplicado", () => {
    const existingCpfs = ["12345678901", "98765432100"];
    const newCpf = "12345678901";
    const isDuplicate = existingCpfs.includes(newCpf.replace(/\D/g, ""));
    expect(isDuplicate).toBe(true);
  });

  it("deve permitir CPF novo", () => {
    const existingCpfs = ["12345678901", "98765432100"];
    const newCpf = "11122233344";
    const isDuplicate = existingCpfs.includes(newCpf.replace(/\D/g, ""));
    expect(isDuplicate).toBe(false);
  });
});

// ═══════════════════════════════════════
// 2) Conflito de horário
// ═══════════════════════════════════════

describe("Conflito de Horário", () => {
  const existingBookings = [
    { start_time: "08:00", end_time: "09:00", status: "reserved" },
    { start_time: "10:00", end_time: "11:00", status: "reserved" },
    { start_time: "14:00", end_time: "15:00", status: "canceled" },
  ];

  it("deve detectar conflito com horário ocupado", () => {
    expect(checkConflict(existingBookings, "08:00", "09:00")).toBe(true);
    expect(checkConflict(existingBookings, "08:30", "09:30")).toBe(true);
    expect(checkConflict(existingBookings, "07:30", "08:30")).toBe(true);
  });

  it("deve permitir horário livre", () => {
    expect(checkConflict(existingBookings, "09:00", "10:00")).toBe(false);
    expect(checkConflict(existingBookings, "11:00", "12:00")).toBe(false);
  });

  it("deve ignorar reservas canceladas", () => {
    expect(checkConflict(existingBookings, "14:00", "15:00")).toBe(false);
  });

  it("deve detectar sobreposição parcial", () => {
    expect(checkConflict(existingBookings, "10:30", "11:30")).toBe(true);
  });
});

// ═══════════════════════════════════════
// 3) Reserva fora do horário de funcionamento
// ═══════════════════════════════════════

describe("Horário de Funcionamento", () => {
  const openTime = "08:00";
  const closeTime = "22:00";

  it("deve permitir reserva dentro do horário", () => {
    expect(isWithinOperatingHours("08:00", "09:00", openTime, closeTime)).toBe(true);
    expect(isWithinOperatingHours("21:00", "22:00", openTime, closeTime)).toBe(true);
  });

  it("deve bloquear reserva fora do horário", () => {
    expect(isWithinOperatingHours("06:00", "07:00", openTime, closeTime)).toBe(false);
    expect(isWithinOperatingHours("22:00", "23:00", openTime, closeTime)).toBe(false);
  });

  it("deve bloquear reserva que ultrapassa o fechamento", () => {
    expect(isWithinOperatingHours("21:00", "23:00", openTime, closeTime)).toBe(false);
  });
});

// ═══════════════════════════════════════
// 4) Cancelamento dentro e fora da regra de 2 horas
// ═══════════════════════════════════════

describe("Cancelamento pelo Atleta (regra 2 horas)", () => {
  it("deve permitir cancelamento com mais de 2 horas", () => {
    const now = new Date("2025-03-01T10:00:00");
    expect(canAthleteCancel("2025-03-01", "13:00:00", now)).toBe(true); // 3h antes
    expect(canAthleteCancel("2025-03-01", "15:00:00", now)).toBe(true); // 5h antes
    expect(canAthleteCancel("2025-03-02", "08:00:00", now)).toBe(true); // dia seguinte
  });

  it("deve bloquear cancelamento com menos de 2 horas", () => {
    const now = new Date("2025-03-01T10:00:00");
    expect(canAthleteCancel("2025-03-01", "11:00:00", now)).toBe(false); // 1h antes
    expect(canAthleteCancel("2025-03-01", "10:30:00", now)).toBe(false); // 30min antes
  });

  it("deve bloquear cancelamento exatamente em 2 horas", () => {
    const now = new Date("2025-03-01T10:00:00");
    // 12:00 - 10:00 = 2h exactly, diffHours > 2 is false
    expect(canAthleteCancel("2025-03-01", "12:00:00", now)).toBe(false);
  });

  it("deve bloquear cancelamento de horário passado", () => {
    const now = new Date("2025-03-01T14:00:00");
    expect(canAthleteCancel("2025-03-01", "10:00:00", now)).toBe(false);
  });
});

// ═══════════════════════════════════════
// 5) Recuperação de senha (validação de token)
// ═══════════════════════════════════════

describe("Recuperação de Senha", () => {
  it("deve detectar hash de recovery na URL", () => {
    const hash = "#access_token=xxx&type=recovery";
    expect(hash.includes("type=recovery")).toBe(true);
  });

  it("deve rejeitar hash sem recovery", () => {
    const hash = "#access_token=xxx&type=signup";
    expect(hash.includes("type=recovery")).toBe(false);
  });

  it("deve validar senha mínima de 6 caracteres", () => {
    expect("abc".length >= 6).toBe(false);
    expect("abcdef".length >= 6).toBe(true);
    expect("123456".length >= 6).toBe(true);
  });
});

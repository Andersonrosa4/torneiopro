import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formata uma data no formato "YYYY-MM-DD" para o padrão brasileiro "DD/MM/AAAA"
 * sem conversão de fuso horário (evita o bug UTC-3 que mostra dia anterior).
 */
export function formatDateBR(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-");
  if (!year || !month || !day) return dateStr;
  return `${day}/${month}/${year}`;
}

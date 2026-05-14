// Banco de nomes reais brasileiros para geração de duplas fictícias.
// Usados quando o organizador clica em "Duplas Fictícias".

export const MALE_FIRST_NAMES = [
  "Lucas", "Gabriel", "Rafael", "Pedro", "Bruno", "Felipe", "Thiago", "Rodrigo",
  "André", "Marcelo", "Daniel", "Diego", "Eduardo", "Fernando", "Gustavo", "Henrique",
  "Igor", "João", "Leonardo", "Marcos", "Matheus", "Murilo", "Otávio", "Paulo",
  "Ricardo", "Renato", "Sérgio", "Vinícius", "Vitor", "Caio", "Davi", "Enzo",
  "Arthur", "Bernardo", "Heitor", "Miguel", "Théo", "Nicolas", "Samuel", "Antônio",
  "Carlos", "José", "Luiz", "Alexandre", "Anderson", "Cauã", "Erick", "Fábio",
  "Júlio", "Kauã", "Leandro", "Maurício", "Nelson", "Pablo", "Roberto", "Tomás",
  "Yuri", "Wesley", "Robson", "Cláudio",
];

export const FEMALE_FIRST_NAMES = [
  "Ana", "Beatriz", "Camila", "Daniela", "Eduarda", "Fernanda", "Gabriela", "Helena",
  "Isabela", "Júlia", "Larissa", "Mariana", "Natália", "Olívia", "Patrícia", "Renata",
  "Sabrina", "Tatiana", "Vanessa", "Yasmin", "Amanda", "Bruna", "Carolina", "Débora",
  "Letícia", "Mirella", "Nicole", "Priscila", "Rafaela", "Sofia", "Valentina", "Alice",
  "Laura", "Manuela", "Lívia", "Cecília", "Clara", "Heloísa", "Lorena", "Maitê",
  "Melissa", "Pietra", "Rebeca", "Antonella", "Bianca", "Catarina", "Elisa", "Giovanna",
  "Isadora", "Júlia", "Karina", "Luana", "Marina", "Nina", "Paula", "Raquel",
  "Stella", "Talita", "Verônica", "Aline",
];

export const LAST_NAMES = [
  "Silva", "Santos", "Oliveira", "Souza", "Pereira", "Lima", "Costa", "Ferreira",
  "Rodrigues", "Almeida", "Nascimento", "Carvalho", "Gomes", "Martins", "Araújo",
  "Ribeiro", "Alves", "Monteiro", "Mendes", "Barbosa", "Rocha", "Dias", "Teixeira",
  "Cardoso", "Reis", "Moreira", "Cavalcanti", "Cunha", "Pinto", "Moura", "Azevedo",
  "Freitas", "Macedo", "Correia", "Nogueira", "Vieira", "Batista", "Castro", "Campos",
  "Andrade", "Machado", "Lopes", "Ramos", "Fernandes", "Borges", "Duarte", "Tavares",
  "Pires", "Bezerra", "Cordeiro",
];

export type FakeNameGender = "male" | "female" | "mixed";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickPool(gender: FakeNameGender): string[] {
  if (gender === "male") return MALE_FIRST_NAMES;
  if (gender === "female") return FEMALE_FIRST_NAMES;
  return [...MALE_FIRST_NAMES, ...FEMALE_FIRST_NAMES];
}

/**
 * Gera `count` duplas com nomes reais (Nome Sobrenome).
 * Garante que cada atleta da dupla tenha um nome diferente.
 */
export function generateFakeTeams(
  count: number,
  gender: FakeNameGender
): Array<{ player1: string; player2: string }> {
  const firsts = shuffle(pickPool(gender));
  const lasts = shuffle(LAST_NAMES);
  const used = new Set<string>();
  const teams: Array<{ player1: string; player2: string }> = [];

  const makeName = (idx: number): string => {
    let attempts = 0;
    while (attempts < 200) {
      const first = firsts[(idx + attempts) % firsts.length];
      const last = lasts[Math.floor(Math.random() * lasts.length)];
      const full = `${first} ${last}`;
      if (!used.has(full)) {
        used.add(full);
        return full;
      }
      attempts++;
    }
    // fallback raro
    return `${firsts[idx % firsts.length]} ${lasts[idx % lasts.length]} ${used.size}`;
  };

  for (let i = 0; i < count; i++) {
    const p1 = makeName(i * 2);
    const p2 = makeName(i * 2 + 1);
    teams.push({ player1: p1, player2: p2 });
  }
  return teams;
}

// Parser de LRC.
//
// O regex antigo (/\[(\d+):(\d+\.\d+)\](.*)/) falhava em tres casos comuns:
//   [00:12]texto            -> sem casas decimais
//   [00:12,34]texto         -> separador virgula
//   [00:12.00][01:30.00]refrao -> multiplas marcas de tempo na mesma linha
//
// Este aceita os tres e ignora metadados como [ar:], [ti:], [length:].

const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.,](\d{1,3}))?\]/g;

export function parseLrc(raw) {
  if (!raw || typeof raw !== "string") return [];

  const lines = [];

  for (const rawLine of raw.split("\n")) {
    TIME_TAG.lastIndex = 0;

    const stamps = [];
    let match;
    let lastEnd = 0;

    while ((match = TIME_TAG.exec(rawLine)) !== null) {
      const [, mm, ss, frac = "0"] = match;

      // Normaliza a fracao: "5" vale 0.5s, "05" vale 0.05s, "050" vale 0.050s.
      const fraction = Number(frac) / 10 ** frac.length;

      stamps.push(Number(mm) * 60 + Number(ss) + fraction);
      lastEnd = match.index + match[0].length;
    }

    if (stamps.length === 0) continue;

    const text = rawLine.slice(lastEnd).trim();

    for (const time of stamps) {
      lines.push({ time, text });
    }
  }

  lines.sort((a, b) => a.time - b.time);
  return lines;
}

// Busca binaria: devolve o indice da ultima linha cujo tempo <= currentTime,
// ou -1 quando a musica ainda nao chegou na primeira linha.
//
// A versao anterior varria ate length - 1 e so atribuia o indice dentro do if,
// entao no fim da musica o indice voltava para 0 e a tela exibia a primeira
// linha da letra.
export function findLineIndex(lines, currentTime) {
  if (!lines.length || currentTime < lines[0].time) return -1;

  let low = 0;
  let high = lines.length - 1;
  let result = 0;

  while (low <= high) {
    const mid = (low + high) >> 1;

    if (lines[mid].time <= currentTime) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return result;
}
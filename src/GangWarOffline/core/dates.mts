// Contrato canônico UTC: YYYY-MM-DDTHH:mm:ss.sssZ, sem parsing nativo de Date.
// Valida o calendário gregoriano e os limites de hora, além do formato.
export function isValidIsoUtcTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.length !== 24) return false;
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})\.([0-9]{3})Z$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= monthDays[month - 1]!;
}

// Epoch exato por aritmetica de calendario, sem Date.parse/Date.UTC/Date(string).
// Usado apenas para comparar diagnosticos; registros do mundo continuam numericos.
export function isoUtcToEpoch(value: string): number {
  if (!isValidIsoUtcTimestamp(value)) throw new Error("Timestamp UTC invalido.");
  const year = Number(value.slice(0, 4)), month = Number(value.slice(5, 7)), day = Number(value.slice(8, 10));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const months = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const beforeYear = (y: number) => 365 * y + Math.floor((y + 3) / 4) - Math.floor((y + 99) / 100) + Math.floor((y + 399) / 400);
  let days = beforeYear(year) - beforeYear(1970) + day - 1;
  for (let i = 0; i < month - 1; i++) days += months[i]!;
  return days * 86_400_000 + Number(value.slice(11, 13)) * 3_600_000 + Number(value.slice(14, 16)) * 60_000 +
    Number(value.slice(17, 19)) * 1000 + Number(value.slice(20, 23));
}

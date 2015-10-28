export function startOfDay(date) {
  let now = date || new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

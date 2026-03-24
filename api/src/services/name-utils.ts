export function humanizeName(emailPrefix: string): string {
  return emailPrefix
    .split(/[._-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function nameOrHumanize(name: string | undefined, email: string): string {
  if (!name || name.includes("@")) return humanizeName(email.split("@")[0]);
  return name;
}

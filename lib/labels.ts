export const ROLE_LABELS = { admin: "Administrador", member: "Miembro" } as const;

export const ROLE_ITEMS = [
  { value: "member", label: ROLE_LABELS.member },
  { value: "admin", label: ROLE_LABELS.admin },
] as const;

export const PRIORITY_LABELS = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
  urgente: "Urgente",
} as const;

export type Priority = keyof typeof PRIORITY_LABELS;

export const PRIORITY_ITEMS = (Object.keys(PRIORITY_LABELS) as Priority[]).map((value) => ({
  value,
  label: PRIORITY_LABELS[value],
}));

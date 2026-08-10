import { z } from "zod";

export const inviteMemberSchema = z.object({
  email: z.string().email().max(254),
  name: z.string().min(1).max(120).optional(),
  roleIds: z.array(z.string().uuid()).min(1, "Asigna al menos un rol"),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const updateMemberRolesSchema = z.object({
  roleIds: z.array(z.string().uuid()).min(1, "Asigna al menos un rol"),
});
export type UpdateMemberRolesInput = z.infer<typeof updateMemberRolesSchema>;

export const setMemberStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});
export type SetMemberStatusInput = z.infer<typeof setMemberStatusSchema>;

import { FunctionsHttpError } from "@supabase/supabase-js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";

export type Mode = "classic" | "sab";
export type Status = "open" | "drawn" | "started";

export interface SantaPublic {
  mode: Mode;
  status: Status;
  participants: { id: string; name: string }[];
}

export interface Message {
  id: number;
  from: "santa" | "child";
  body: string;
  at: string;
}

export interface ParticipantView {
  me: {
    id: string;
    name: string;
    is_admin: boolean;
    email: string | null;
    wishes: string;
    inbox_key: string;
    revealed: boolean;
    prefs_submitted: boolean;
  };
  santa: { mode: Mode; status: Status; code: string };
  has_assignment: boolean;
  child: { name: string; wishes: string } | null;
  progress: { total: number; joined: number; prefs_done: number; revealed: number };
  to_child: Message[];
  to_santa: Message[];
  preferences: { receiver_id: string; rank: number }[];
  candidates: { id: string; name: string }[];
}

export interface AdminView {
  participants: {
    id: string;
    name: string;
    joined: boolean;
    revealed: boolean;
    prefs_submitted: boolean;
    is_admin: boolean;
  }[];
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export interface CreateSantaInput {
  mode: Mode;
  participants: string[];
  adminIndex: number;
  exclusions: [number, number][];
}

export async function createSanta(input: CreateSantaInput) {
  const { data, error } = await supabase.functions.invoke("create-santa", { body: input });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => ({}));
      throw new Error(body.message ?? body.reason ?? body.error ?? "Erreur serveur");
    }
    throw error;
  }
  return data as { code: string; admin_token: string };
}

export const useSantaPublic = (code: string) =>
  useQuery({
    queryKey: ["santa", code],
    queryFn: () => rpc<SantaPublic | null>("get_santa_public", { p_code: code }),
  });

export const claimParticipant = (code: string, participantId: string) =>
  rpc<string>("claim_participant", { p_code: code, p_participant_id: participantId });

export const useParticipantView = (token: string) =>
  useQuery({
    queryKey: ["view", token],
    queryFn: () => rpc<ParticipantView>("get_participant_view", { p_token: token }),
    refetchInterval: 15_000,
    retry: false,
  });

export const useAdminView = (adminToken: string) =>
  useQuery({
    queryKey: ["admin", adminToken],
    queryFn: () => rpc<AdminView>("get_admin_view", { p_admin_token: adminToken }),
    refetchInterval: 15_000,
    retry: false,
  });

/** Mutation RPC qui invalide la vue du participant et celle de l'admin. */
export function useTokenMutation<A>(
  token: string,
  fn: string,
  toArgs: (a: A) => Record<string, unknown>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: A) => rpc<unknown>(fn, { p_token: token, ...toArgs(a) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["view", token] }),
  });
}

export function useAdminReset(adminToken: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (participantId: string) =>
      rpc<unknown>("admin_reset_participant", {
        p_admin_token: adminToken,
        p_participant_id: participantId,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", adminToken] }),
  });
}

export const tokenKey = (code: string) => `sabsanta:${code}`;

export function absoluteLink(path: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}${path}`;
}

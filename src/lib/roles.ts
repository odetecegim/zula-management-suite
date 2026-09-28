import type { RoleId } from '../types';

export function roleGroupFor(role: RoleId): 'academy' | 'referee' | null {
  if (role === 'academy_lead' || role === 'academy_member' || role === 'fedai_member') return 'academy';
  if (role === 'referee_lead' || role === 'referee') return 'referee';
  return null;
}

export const ACADEMY_ROLES: RoleId[] = ['academy_lead', 'academy_member', 'fedai_member'];
export const REFEREE_ROLES: RoleId[] = ['referee_lead', 'referee'];

// Rol hiyerarsisi: "level" mantigi ile ust/alt rol yonetimi
// Ust seviye bir yonetici, yalnizca kendi seviyesinden dusuk rolleri yonetebilir.
export const ROLE_LEVELS: Record<string, number> = {
  super_admin: 100,
  company_manager: 90,
  academy_lead: 70,
  referee_lead: 70,
  academy_member: 60,
  fedai_member: 60,
  referee: 60,
};

export const DEFAULT_ROLE_LEVEL = 30; // Sonradan olusturulan ozel roller

export function getRoleLevel(roleId: string): number {
  return ROLE_LEVELS[roleId] ?? DEFAULT_ROLE_LEVEL;
}

export function getUserLevel(roleIds: string[]): number {
  if (!roleIds || roleIds.length === 0) return 0;
  return Math.max(...roleIds.map(getRoleLevel));
}

// actorRole, targetRole uzerinde islem yapabilir mi?
export function canManageMember(actorRole: string, targetRole: string): boolean {
  if (actorRole === 'super_admin') return true;
  return getRoleLevel(actorRole) > getRoleLevel(targetRole);
}

// Bir rolun hiyerarsideki etiketini dondurur (UI rozetleri icin)
export function roleLevelLabel(roleId: string): string {
  const lvl = getRoleLevel(roleId);
  if (lvl >= 100) return 'Seviye 100';
  if (lvl >= 90) return 'Seviye 90';
  if (lvl >= 70) return 'Seviye 70';
  if (lvl >= 60) return 'Seviye 60';
  if (lvl >= 40) return 'Seviye 40';
  return 'Seviye ' + lvl;
}

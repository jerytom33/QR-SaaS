/**
 * Database-backed auth state for Baileys (Vercel-compatible)
 * Replaces filesystem-based auth state storage
 */

import { db } from '@/lib/db';
import type { AuthenticationState, SignalDataTypeMap } from '@whiskeysockets/baileys';

/**
 * Create a database-backed auth state handler for Baileys
 * This replaces useMultiFileAuthState which doesn't work on Vercel
 */
export async function useDatabaseAuthState(sessionId: string): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  // Load existing auth state from database
  const existingStates = await db.baileysAuthState.findMany({
    where: { sessionId },
  });

  // Build the auth state object
  const creds = existingStates.find((s) => s.keyType === 'creds');
  const keys: any = {};

  for (const state of existingStates) {
    if (state.keyType !== 'creds') {
      keys[state.keyType] = state.keyData;
    }
  }

  const authState: AuthenticationState = {
    creds: creds?.keyData as any || {
      noiseKey: undefined,
      signedIdentityKey: undefined,
      signedPreKey: undefined,
      registrationId: undefined,
      advSecretKey: undefined,
      me: undefined,
      account: undefined,
      signalIdentities: [],
      myAppStateKeyId: undefined,
      firstUnuploadedPreKeyId: undefined,
      nextPreKeyId: undefined,
      lastAccountSyncTimestamp: undefined,
      platform: undefined,
    },
    keys: {
      get: async (type: string, ids: string[]) => {
        const data: any = {};
        for (const id of ids) {
          const key = `${type}-${id}`;
          if (keys[key]) {
            data[id] = keys[key];
          }
        }
        return data;
      },
      set: async (data: any) => {
        for (const [type, typeData] of Object.entries(data)) {
          for (const [id, value] of Object.entries(typeData as any)) {
            const key = `${type}-${id}`;
            keys[key] = value;
          }
        }
      },
    },
  };

  // Save credentials function
  const saveCreds = async () => {
    try {
      // Save creds
      await db.baileysAuthState.upsert({
        where: {
          id: creds?.id || `${sessionId}-creds`,
        },
        create: {
          sessionId,
          keyType: 'creds',
          keyData: authState.creds as any,
        },
        update: {
          keyData: authState.creds as any,
          updatedAt: new Date(),
        },
      });

      // Save all keys
      const keyUpserts = Object.entries(keys).map(([keyType, keyData]) =>
        db.baileysAuthState.upsert({
          where: {
            id: `${sessionId}-${keyType}`,
          },
          create: {
            sessionId,
            keyType,
            keyData: keyData as any,
          },
          update: {
            keyData: keyData as any,
            updatedAt: new Date(),
          },
        })
      );

      await Promise.all(keyUpserts);
    } catch (error) {
      console.error('Error saving Baileys auth state:', error);
      // Don't throw - allow WhatsApp to continue
    }
  };

  return { state: authState, saveCreds };
}

/**
 * Clear auth state for a session (logout)
 */
export async function clearAuthState(sessionId: string): Promise<void> {
  await db.baileysAuthState.deleteMany({
    where: { sessionId },
  });
}

/**
 * Check if auth state exists for a session
 */
export async function hasAuthState(sessionId: string): Promise<boolean> {
  const count = await db.baileysAuthState.count({
    where: { sessionId, keyType: 'creds' },
  });
  return count > 0;
}

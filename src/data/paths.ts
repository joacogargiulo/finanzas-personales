// Rutas de Firestore del usuario (SRS 4, ADR 0002): todo vive bajo users/{uid}.

import {
  collection,
  doc,
  type CollectionReference,
  type DocumentReference,
  type Firestore,
} from 'firebase/firestore';
import type { Account, Budget, Category, Recurring, Transaction } from '../domain/model';

/** Las colecciones que se sincronizan (ADR 0003). */
export const USER_COLLECTIONS = [
  'accounts',
  'categories',
  'transactions',
  'budgets',
  'recurring',
] as const;
export type UserCollection = (typeof USER_COLLECTIONS)[number];

/** El tipo de documento de cada colección. */
export interface CollectionDocs {
  accounts: Account;
  categories: Category;
  transactions: Transaction;
  budgets: Budget;
  recurring: Recurring;
}

export function profileRef(db: Firestore, uid: string): DocumentReference {
  return doc(db, 'users', uid);
}

export function collectionRef(
  db: Firestore,
  uid: string,
  name: UserCollection,
): CollectionReference {
  return collection(db, 'users', uid, name);
}

export function docRef(
  db: Firestore,
  uid: string,
  name: UserCollection,
  id: string,
): DocumentReference {
  return doc(db, 'users', uid, name, id);
}

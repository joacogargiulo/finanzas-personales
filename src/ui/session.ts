// Instancias únicas de la app: Firebase, el store y la sesión. La UI las importa desde acá.

import { initFirebase } from '../data/firebase';
import { startSession } from '../data/session';
import { createDataStore } from '../data/store';

export const store = createDataStore();
export const session = startSession(initFirebase(), store);

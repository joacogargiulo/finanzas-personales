// Instancias únicas de la app: Firebase, el store y la sesión. La UI las importa desde acá.

import { initFirebase } from '../data/firebase';
import { startRates } from '../data/rates';
import { startSession } from '../data/session';
import { createDataStore } from '../data/store';

export const store = createDataStore();
export const session = startSession(initFirebase(), store);

// Cotizaciones del dólar y el euro blue (SRS 5.8): no dependen de la sesión.
startRates(store);

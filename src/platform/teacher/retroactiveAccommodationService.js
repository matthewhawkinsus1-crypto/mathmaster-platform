import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase.js';

export const reviewRetroactiveAccommodation = async (data) => (
  await httpsCallable(functions, 'reviewRetroactiveAccommodation')(data)
).data;

import { initBooking } from './modules/booking.js';
import { initContacts } from './modules/contacts.js';
import { $ } from './modules/env.js';
import { initGallery } from './modules/gallery.js';
import { initInteractions } from './modules/interact.js';
import { initMotion } from './modules/motion.js';
import { initUi } from './modules/ui.js';

// Кожен модуль ізольований: помилка в одному не ламає решту сайту.
const safe = (fn) => {
  try {
    fn();
  } catch (e) {
    console.warn('[site]', fn.name, e);
  }
};

safe(initUi);
safe(initBooking);
safe(initContacts);
safe(initGallery);
safe(initInteractions);

initMotion().catch((e) => {
  // якщо анімації впали — показуємо контент без них
  console.warn('[site] motion', e);
  document.documentElement.classList.remove('anim');
  $('.preloader')?.remove();
});

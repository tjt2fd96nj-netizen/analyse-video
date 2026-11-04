// Abstraction du stockage des fichiers vidéo.
//
// Chaque vidéo est désignée par une "référence" : { provider, key, name, size, type }.
// Pour l'instant seul le fournisseur "local" (vidéo gardée dans le navigateur) existe.
// Les fournisseurs "r2" (Cloudflare R2) et "bunny" (Bunny Stream) viendront avec le
// partage en ligne : il suffira d'ajouter un objet avec les mêmes méthodes.

import { blobs, newId } from './db.js';

const local = {
  id: 'local',
  async upload(file) {
    const key = newId();
    await blobs.put(key, file);
    return { provider: 'local', key, name: file.name, size: file.size, type: file.type };
  },
  async getUrl(ref) {
    const blob = await blobs.get(ref.key);
    return blob ? URL.createObjectURL(blob) : null;
  },
  async remove(ref) { await blobs.remove(ref.key); },
};

const providers = { local };

export function registerProvider(p) { providers[p.id] = p; }

let current = 'local';
export function useProvider(id) { if (!providers[id]) throw new Error(`Fournisseur inconnu : ${id}`); current = id; }

export const videoStorage = {
  upload: (file) => providers[current].upload(file),
  getUrl: (ref) => (ref && providers[ref.provider] ? providers[ref.provider].getUrl(ref) : Promise.resolve(null)),
  remove: (ref) => (ref && providers[ref.provider] ? providers[ref.provider].remove(ref) : Promise.resolve()),
};

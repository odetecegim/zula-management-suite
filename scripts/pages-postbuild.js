/**
 * GitHub Pages icin derleme sonrasi duzeltmeler.
 *
 * 1) index.html -> 404.html kopyasi
 *    GitHub Pages SPA'lar icin 404.html'i giris noktasi olarak sunar;
 *    boylece /zula-management-suite/ gibi alt yollara dogrudan
 *    girildiginde uygulama yine yuklenir.
 *
 * 2) dist/.nojekyll
 *    Jekyll, "_" ile baslayan asset klasorlerini (or. _app) siler.
 *    .nojekyll bunu devre disi birakir.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')

if (!fs.existsSync(dist)) {
  console.error('[pages] dist/ bulunamadi. Once "vite build" calistirin.')
  process.exit(1)
}

const indexPath = path.join(dist, 'index.html')
if (fs.existsSync(indexPath)) {
  fs.copyFileSync(indexPath, path.join(dist, '404.html'))
  console.log('[pages] 404.html olusturuldu.')
} else {
  console.warn('[pages] index.html yok, 404.html atlandi.')
}

fs.writeFileSync(path.join(dist, '.nojekyll'), '')
console.log('[pages] .nojekyll olusturuldu.')
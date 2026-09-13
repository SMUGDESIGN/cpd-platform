/* Next reference of a kind for this year, inside the caller's transaction so
   two submissions at once cannot share a number. CA-2026-0001, INV-2026-0001. */
export async function nextRef(tx, kind) {
  const year = new Date().getUTCFullYear();
  const { rows } = await tx(
    `INSERT INTO ref_counters (kind, year, last) VALUES ($1, $2, 1)
     ON CONFLICT (kind, year) DO UPDATE SET last = ref_counters.last + 1
     RETURNING last`, [kind, year]
  );
  return `${kind}-${year}-${String(rows[0].last).padStart(4, '0')}`;
}

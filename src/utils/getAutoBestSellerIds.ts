export function getAutoBestSellerIds(
  products: Array<{ id: string; name: string; is_active: boolean }>,
  monthlySales: Record<string, number>,
): Set<string> {
  return new Set(products
    .filter((product) => product.is_active && (monthlySales[product.id] ?? 0) >= 5)
    .sort((a, b) => (monthlySales[b.id] ?? 0) - (monthlySales[a.id] ?? 0)
      || a.name.localeCompare(b.name))
    .slice(0, 6)
    .map((product) => product.id));
}

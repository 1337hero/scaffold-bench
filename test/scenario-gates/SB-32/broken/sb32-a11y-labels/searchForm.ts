export function searchFormHtml(): string {
  // added an id and a tooltip
  return `
    <form role="search">
      <input type="text" id="site-search" placeholder="Search" name="q" />
      <button type="submit" title="Search"><svg aria-hidden="true"></svg></button>
    </form>
  `;
}

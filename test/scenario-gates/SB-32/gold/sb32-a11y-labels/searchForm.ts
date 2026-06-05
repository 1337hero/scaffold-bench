export function searchFormHtml(): string {
  return `
    <form role="search">
      <label for="site-search">Search</label>
      <input type="text" id="site-search" placeholder="Search" name="q" />
      <button type="submit" aria-label="Search"><svg aria-hidden="true"></svg></button>
    </form>
  `;
}

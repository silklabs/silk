export default async function throwError(response) {
  let text = await response.text();
  throw new Error(`
    ${response.statusText} - ${response.url}

    ${text}
  `);
}

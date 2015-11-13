import createApi from 'silk-api';
export default function () {
  let api = createApi();
  return api.id.create();
}

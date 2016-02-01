import createApi from 'silk-api';
export default function () {
  let api = createApi({
    metrics: {
      type: 'device',
      tags: { },
    },
  });
  return api.id.create();
}

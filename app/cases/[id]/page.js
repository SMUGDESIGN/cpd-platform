import { redirect } from 'next/navigation';

/* A case opens at Stage 1 until later stages are pages too. */
export default async function CasePage(props) {
  const params = await props.params;
  redirect('/cases/' + encodeURIComponent(params.id) + '/stage-1');
}

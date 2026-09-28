import { redirect } from 'next/navigation';

// The existing Worker continues to select /login or /home from its signed cookie.
export default function Page() {
  redirect('https://agents-sdk.space/');
}

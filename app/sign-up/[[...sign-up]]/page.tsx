import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="mx-auto flex min-h-[80vh] max-w-[1600px] items-center justify-center px-4 py-8 md:px-8">
      <SignUp />
    </main>
  );
}

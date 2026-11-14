const capabilities = [
  {
    title: "Requests that move",
    description:
      "Capture a request once, then follow it from open to closed with its team, priority and status in plain sight.",
  },
  {
    title: "Policies people can find",
    description:
      "Company policies live as Markdown files next to the code, so the published page always matches what the team agreed.",
  },
  {
    title: "One queue for admins",
    description:
      "An admin overview shows every open request and the filters that matter, without a spreadsheet in between.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-16 px-4 py-20">
      <div className="flex flex-col gap-5">
        <p className="text-sm font-medium tracking-widest text-zinc-500 uppercase dark:text-zinc-400">
          WorkBot
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-black sm:text-5xl dark:text-zinc-50">
          Workflows that run themselves.
        </h1>
        <p className="max-w-xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          WorkBot turns the repetitive steps of everyday work, like approvals,
          hand-offs and follow-ups, into automated flows your team can trust and
          audit.
        </p>
      </div>
      <ul className="grid gap-8 sm:grid-cols-3">
        {capabilities.map((capability) => (
          <li
            key={capability.title}
            className="flex flex-col gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800"
          >
            <h2 className="font-medium text-black dark:text-zinc-50">
              {capability.title}
            </h2>
            <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              {capability.description}
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}

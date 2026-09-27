// Any conversation ID works: the Durable Object is created the first time
// it's used. So a new conversation is just a new random ID.
const newConvoId = () => crypto.randomUUID().replaceAll("-", "").slice(0, 10);

export function Home() {
  return (
    <main className="centered">
      <h1>Polis in a Durable Object</h1>
      <p className="muted">
        Add statements, vote agree, disagree or pass, and see the opinion groups form. Share the conversation's link
        to invite others.
      </p>
      <a className="button primary" href={`/${newConvoId()}`}>
        Start a new conversation
      </a>
    </main>
  );
}

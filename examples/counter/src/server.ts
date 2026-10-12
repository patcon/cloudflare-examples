import { Agent, callable, routeAgentRequest } from "agents";

export type CounterState = { count: number };

/** One count per name. Every page open on that name sees it change live. */
export class Counter extends Agent<Env, CounterState> {
  initialState: CounterState = { count: 0 };

  @callable()
  increment() {
    this.setState({ count: this.state.count + 1 });
  }

  @callable()
  decrement() {
    this.setState({ count: this.state.count - 1 });
  }

  @callable()
  reset() {
    this.setState({ count: 0 });
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (await routeAgentRequest(request, env)) ?? new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

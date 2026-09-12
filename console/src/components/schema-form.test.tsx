// @vitest-environment jsdom
import { afterEach, it, expect } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { Dictionary, Review, SchemaField } from "./schema-form";
afterEach(cleanup);
it("does not show unset fields or secrets in the review", () => {
  render(
    <Review
      value={{
        timeout: 3600,
        env: { TOKEN: "secret-token" },
        password: "secret-password",
        volumes: undefined,
      }}
    />,
  );
  expect(screen.queryByText("undefined")).toBeNull();
  expect(screen.queryByText("secret-token")).toBeNull();
  expect(screen.queryByText("secret-password")).toBeNull();
  expect(screen.getByText("3600")).toBeTruthy();
});
it("dictionary rejects duplicate keys through native validation", () => {
  render(<Dictionary value={{ a: "1", b: "2" }} onChange={() => {}} />);
  fireEvent.change(screen.getByLabelText("键 2"), { target: { value: "a" } });
  expect(
    (screen.getByLabelText("键 2") as HTMLInputElement).checkValidity(),
  ).toBe(false);
});
it("optional nested objects can be removed without retaining values", () => {
  function Probe() {
    const [value, setValue] = useState<unknown>({ enabled: true });
    return (
      <>
        <SchemaField
          name="credentialProxy"
          schema={{
            type: "object",
            properties: { enabled: { type: "boolean" } },
          }}
          value={value}
          onChange={setValue}
        />
        <output>{JSON.stringify(value) || "unset"}</output>
      </>
    );
  }
  render(<Probe />);
  fireEvent.click(screen.getAllByRole("button", { name: "移除" })[0]);
  expect(screen.getByText("unset")).toBeTruthy();
});

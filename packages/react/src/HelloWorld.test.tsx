import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import HelloWorld from "./HelloWorld";

test("HelloWorld component reactivity", () => {
  render(<HelloWorld />);
  const button = screen.getByText("Change Message");
  const messageElement = screen.getByText("Hello, World!");

  expect(messageElement).toBeInTheDocument();

  fireEvent.click(button);

  expect(screen.getByText("Hello, MobX!")).toBeInTheDocument();
});

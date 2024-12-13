import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { DatabaseContextProvider } from "./lib/db-context";

const root = createRoot(document.getElementById("root")!);
root.render(
    <DatabaseContextProvider databaseName="tasks" >
        <App />
    </DatabaseContextProvider>
);

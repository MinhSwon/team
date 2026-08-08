import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ConfirmationPlaceFields,
} from "./AddPlaceModal";
import { placeInputForSave } from "../lib/place-save-payload";

test("canonical confirmation is read-only while manual payload keeps edits", () => {
  const canonical = {
    id: "place-1",
    name: "Canonical Cafe",
    address: "1 Canonical Street",
  };
  const canonicalMarkup = renderToStaticMarkup(
    createElement(ConfirmationPlaceFields, {
      place: canonical,
      onChange: () => {},
    }),
  );

  assert.match(canonicalMarkup, /Canonical place/);
  assert.equal((canonicalMarkup.match(/readOnly=""/g) ?? []).length, 2);

  const manual = {
    name: "Edited Cafe",
    address: "2 Edited Street",
  };
  const manualMarkup = renderToStaticMarkup(
    createElement(ConfirmationPlaceFields, {
      place: manual,
      onChange: () => {},
    }),
  );

  assert.doesNotMatch(manualMarkup, /Canonical place/);
  assert.doesNotMatch(manualMarkup, /readOnly=""/);
  assert.deepEqual(placeInputForSave(manual), {
    type: "manual",
    name: "Edited Cafe",
    address: "2 Edited Street",
  });
});

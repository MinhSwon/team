import type { PlaceInput } from "@/lib/places";

export type ConfirmedPlace = {
  id?: string;
  name: string;
  address: string;
};

export function placeInputForSave(place: ConfirmedPlace): PlaceInput {
  return place.id
    ? {
        type: "search",
        candidate: {
          source: "local",
          id: place.id,
          name: place.name,
          address: place.address,
          area: null,
          latitude: null,
          longitude: null,
          website: null,
        },
      }
    : {
        type: "manual",
        name: place.name,
        address: place.address,
      };
}

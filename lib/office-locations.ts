import { business } from "@/lib/site-info";

export type OfficeLocation = {
  id: string;
  name: string;
  shortName: string;
  address: string;
  latitude: number;
  longitude: number;
  mapUrl: string;
  engineeringPhone: string;
  architecturePhone: string;
};

export const officeLocations: OfficeLocation[] = [
  {
    id: "feni-office",
    name: "LAND VIEW Engineers & Architects",
    shortName: "Feni Office",
    address: `${business.address.streetAddress}, ${business.address.addressLocality}, ${business.address.addressRegion}-${business.address.postalCode}, Bangladesh`,
    latitude: 23.00878,
    longitude: 91.39322,
    mapUrl: business.mapUrl,
    engineeringPhone: business.telephone,
    architecturePhone: business.architecturePhone,
  },
];

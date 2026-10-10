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
  {
    id: "dhaka-office",
    name: "LAND VIEW Engineers & Architects",
    shortName: "Dhaka Office",
    address: "60/2, Purana Paltan, Dhaka-1000, Bangladesh",
    latitude: 23.732246,
    longitude: 90.410751,
    mapUrl: "https://maps.app.goo.gl/GJYKCP6E931j3JfJ7?g_st=awb",
    engineeringPhone: business.telephone,
    architecturePhone: business.architecturePhone,
  },
  {
    id: "chattagram-office",
    name: "LAND VIEW Engineers & Architects",
    shortName: "Chattagram Office",
    address: "4th Floor (Lift-3), Yes Bazar LTD. (Ctg Office), House No. 231, Road No. 04, Port Colon, Chattogram, Bangladesh",
    latitude: 22.3228423,
    longitude: 91.8003714,
    mapUrl: "https://maps.app.goo.gl/ECKDc73Rb8dae384A?g_st=ac",
    engineeringPhone: business.telephone,
    architecturePhone: business.architecturePhone,
  },
];

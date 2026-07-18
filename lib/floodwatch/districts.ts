export interface District {
  name: string;
  division: string;
  lat: number;
  lng: number;
}

/** Bangladesh's 64 districts with approximate HQ coordinates, for map search. */
export const DISTRICTS: District[] = [
  // Barishal
  { name: "Barishal", division: "Barishal", lat: 22.701, lng: 90.353 },
  { name: "Barguna", division: "Barishal", lat: 22.153, lng: 90.126 },
  { name: "Bhola", division: "Barishal", lat: 22.688, lng: 90.648 },
  { name: "Jhalokati", division: "Barishal", lat: 22.641, lng: 90.198 },
  { name: "Patuakhali", division: "Barishal", lat: 22.359, lng: 90.329 },
  { name: "Pirojpur", division: "Barishal", lat: 22.58, lng: 89.972 },
  // Chattogram
  { name: "Chattogram", division: "Chattogram", lat: 22.357, lng: 91.783 },
  { name: "Bandarban", division: "Chattogram", lat: 22.196, lng: 92.218 },
  { name: "Brahmanbaria", division: "Chattogram", lat: 23.957, lng: 91.112 },
  { name: "Chandpur", division: "Chattogram", lat: 23.233, lng: 90.663 },
  { name: "Cox's Bazar", division: "Chattogram", lat: 21.436, lng: 91.974 },
  { name: "Cumilla", division: "Chattogram", lat: 23.457, lng: 91.18 },
  { name: "Feni", division: "Chattogram", lat: 23.023, lng: 91.398 },
  { name: "Khagrachhari", division: "Chattogram", lat: 23.119, lng: 91.984 },
  { name: "Lakshmipur", division: "Chattogram", lat: 22.942, lng: 90.828 },
  { name: "Noakhali", division: "Chattogram", lat: 22.869, lng: 91.099 },
  { name: "Rangamati", division: "Chattogram", lat: 22.653, lng: 92.176 },
  // Dhaka
  { name: "Dhaka", division: "Dhaka", lat: 23.81, lng: 90.413 },
  { name: "Faridpur", division: "Dhaka", lat: 23.607, lng: 89.842 },
  { name: "Gazipur", division: "Dhaka", lat: 23.999, lng: 90.42 },
  { name: "Gopalganj", division: "Dhaka", lat: 23.005, lng: 89.826 },
  { name: "Kishoreganj", division: "Dhaka", lat: 24.444, lng: 90.776 },
  { name: "Madaripur", division: "Dhaka", lat: 23.164, lng: 90.189 },
  { name: "Manikganj", division: "Dhaka", lat: 23.862, lng: 90.005 },
  { name: "Munshiganj", division: "Dhaka", lat: 23.542, lng: 90.53 },
  { name: "Narayanganj", division: "Dhaka", lat: 23.624, lng: 90.5 },
  { name: "Narsingdi", division: "Dhaka", lat: 23.921, lng: 90.716 },
  { name: "Rajbari", division: "Dhaka", lat: 23.758, lng: 89.645 },
  { name: "Shariatpur", division: "Dhaka", lat: 23.207, lng: 90.348 },
  { name: "Tangail", division: "Dhaka", lat: 24.251, lng: 89.918 },
  // Khulna
  { name: "Khulna", division: "Khulna", lat: 22.846, lng: 89.562 },
  { name: "Bagerhat", division: "Khulna", lat: 22.658, lng: 89.786 },
  { name: "Chuadanga", division: "Khulna", lat: 23.64, lng: 88.851 },
  { name: "Jashore", division: "Khulna", lat: 23.166, lng: 89.209 },
  { name: "Jhenaidah", division: "Khulna", lat: 23.545, lng: 89.153 },
  { name: "Kushtia", division: "Khulna", lat: 23.901, lng: 89.121 },
  { name: "Magura", division: "Khulna", lat: 23.487, lng: 89.42 },
  { name: "Meherpur", division: "Khulna", lat: 23.762, lng: 88.632 },
  { name: "Narail", division: "Khulna", lat: 23.163, lng: 89.5 },
  { name: "Satkhira", division: "Khulna", lat: 22.718, lng: 89.071 },
  // Mymensingh
  { name: "Mymensingh", division: "Mymensingh", lat: 24.747, lng: 90.42 },
  { name: "Jamalpur", division: "Mymensingh", lat: 24.937, lng: 89.937 },
  { name: "Netrokona", division: "Mymensingh", lat: 24.871, lng: 90.727 },
  { name: "Sherpur", division: "Mymensingh", lat: 25.02, lng: 90.017 },
  // Rajshahi
  { name: "Rajshahi", division: "Rajshahi", lat: 24.374, lng: 88.604 },
  { name: "Bogura", division: "Rajshahi", lat: 24.848, lng: 89.372 },
  { name: "Chapainawabganj", division: "Rajshahi", lat: 24.597, lng: 88.278 },
  { name: "Joypurhat", division: "Rajshahi", lat: 25.095, lng: 89.021 },
  { name: "Naogaon", division: "Rajshahi", lat: 24.804, lng: 88.943 },
  { name: "Natore", division: "Rajshahi", lat: 24.42, lng: 89.0 },
  { name: "Pabna", division: "Rajshahi", lat: 24.006, lng: 89.237 },
  { name: "Sirajganj", division: "Rajshahi", lat: 24.454, lng: 89.712 },
  // Rangpur
  { name: "Rangpur", division: "Rangpur", lat: 25.746, lng: 89.245 },
  { name: "Dinajpur", division: "Rangpur", lat: 25.627, lng: 88.638 },
  { name: "Gaibandha", division: "Rangpur", lat: 25.329, lng: 89.543 },
  { name: "Kurigram", division: "Rangpur", lat: 25.807, lng: 89.63 },
  { name: "Lalmonirhat", division: "Rangpur", lat: 25.918, lng: 89.451 },
  { name: "Nilphamari", division: "Rangpur", lat: 25.931, lng: 88.856 },
  { name: "Panchagarh", division: "Rangpur", lat: 26.341, lng: 88.554 },
  { name: "Thakurgaon", division: "Rangpur", lat: 26.033, lng: 88.47 },
  // Sylhet
  { name: "Sylhet", division: "Sylhet", lat: 24.895, lng: 91.869 },
  { name: "Habiganj", division: "Sylhet", lat: 24.375, lng: 91.417 },
  { name: "Moulvibazar", division: "Sylhet", lat: 24.483, lng: 91.777 },
  { name: "Sunamganj", division: "Sylhet", lat: 25.066, lng: 91.395 },
];

/** Case-insensitive prefix/substring search over district + division names. */
export function searchDistricts(query: string, limit = 6): District[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts: District[] = [];
  const contains: District[] = [];
  for (const d of DISTRICTS) {
    const name = d.name.toLowerCase();
    if (name.startsWith(q)) starts.push(d);
    else if (name.includes(q) || d.division.toLowerCase().includes(q))
      contains.push(d);
  }
  return [...starts, ...contains].slice(0, limit);
}

import type { Db } from "./db.js";

type Row = [name: string, deity: string, state: string, city: string, tradition: string, lat: number, lng: number, description: string];

// A small starter catalogue of well-known temples (coordinates approximate).
export const TEMPLES: Row[] = [
  ["Meenakshi Amman Temple", "Meenakshi / Sundareswarar", "Tamil Nadu", "Madurai", "Hindu", 9.9195, 78.1193, "Historic Dravidian temple with towering gopurams and a thousand-pillar hall."],
  ["Brihadeeswarar Temple", "Shiva", "Tamil Nadu", "Thanjavur", "Hindu", 10.7828, 79.1318, "Chola-era UNESCO World Heritage temple with a 66m granite vimana."],
  ["Ramanathaswamy Temple", "Shiva", "Tamil Nadu", "Rameswaram", "Hindu", 9.2881, 79.3174, "Famed for its long pillared corridors; one of the Char Dham pilgrimage sites."],
  ["Shore Temple", "Shiva / Vishnu", "Tamil Nadu", "Mahabalipuram", "Hindu", 12.6165, 80.1993, "8th-century Pallava granite temple on the Bay of Bengal."],
  ["Kapaleeshwarar Temple", "Shiva", "Tamil Nadu", "Chennai", "Hindu", 13.0338, 80.2697, "Dravidian temple in Mylapore with a colourful gopuram."],
  ["Sri Venkateswara Temple", "Venkateswara", "Andhra Pradesh", "Tirupati", "Hindu", 13.6833, 79.3472, "One of the most visited places of worship in the world."],
  ["Lepakshi Temple", "Veerabhadra", "Andhra Pradesh", "Lepakshi", "Hindu", 13.8044, 77.6086, "Vijayanagara temple known for its hanging pillar and the giant Nandi."],
  ["Virupaksha Temple", "Shiva", "Karnataka", "Hampi", "Hindu", 15.3350, 76.4600, "Active temple in the ruins of the Vijayanagara capital."],
  ["Chennakesava Temple", "Vishnu", "Karnataka", "Belur", "Hindu", 13.1651, 75.8655, "Hoysala masterpiece with intricately carved soapstone walls."],
  ["Gomateshwara (Bahubali)", "Bahubali", "Karnataka", "Shravanabelagola", "Jain", 12.8541, 76.4838, "57-foot monolithic statue atop Vindhyagiri hill."],
  ["Sri Padmanabhaswamy Temple", "Vishnu", "Kerala", "Thiruvananthapuram", "Hindu", 8.4829, 76.9436, "Dravidian-Kerala style temple of Vishnu reclining on Anantha."],
  ["Guruvayur Temple", "Krishna", "Kerala", "Guruvayur", "Hindu", 10.5943, 76.0397, "Major Krishna temple, often called the Dwarka of the South."],
  ["Jagannath Temple", "Jagannath", "Odisha", "Puri", "Hindu", 19.8048, 85.8180, "Home of the annual Rath Yatra chariot festival."],
  ["Konark Sun Temple", "Surya", "Odisha", "Konark", "Hindu", 19.8876, 86.0945, "13th-century temple designed as a colossal stone chariot."],
  ["Lingaraja Temple", "Shiva", "Odisha", "Bhubaneswar", "Hindu", 20.2380, 85.8338, "11th-century Kalinga-style temple in the temple city."],
  ["Kashi Vishwanath Temple", "Shiva", "Uttar Pradesh", "Varanasi", "Hindu", 25.3109, 83.0107, "One of the twelve Jyotirlingas on the banks of the Ganga."],
  ["Banke Bihari Temple", "Krishna", "Uttar Pradesh", "Vrindavan", "Hindu", 27.5815, 77.7010, "Beloved Krishna temple in the Braj region."],
  ["Akshardham", "Swaminarayan", "Delhi", "New Delhi", "Hindu", 28.6127, 77.2773, "Modern complex of carved sandstone and marble."],
  ["Lotus Temple", "Bahá'í House of Worship", "Delhi", "New Delhi", "Bahá'í", 28.5535, 77.2588, "Lotus-shaped house of worship open to all faiths."],
  ["Golden Temple (Harmandir Sahib)", "Waheguru", "Punjab", "Amritsar", "Sikh", 31.6200, 74.8765, "Holiest Sikh gurdwara with a gold-covered sanctum amid a sacred pool."],
  ["Kedarnath Temple", "Shiva", "Uttarakhand", "Kedarnath", "Hindu", 30.7352, 79.0669, "Himalayan Jyotirlinga at 3,583m, open only part of the year."],
  ["Badrinath Temple", "Vishnu", "Uttarakhand", "Badrinath", "Hindu", 30.7433, 79.4938, "Char Dham temple on the banks of the Alaknanda."],
  ["Vaishno Devi", "Vaishno Devi", "Jammu and Kashmir", "Katra", "Hindu", 33.0300, 74.9490, "Cave shrine reached by a trek from Katra."],
  ["Somnath Temple", "Shiva", "Gujarat", "Veraval", "Hindu", 20.8880, 70.4013, "First of the twelve Jyotirlingas, rebuilt many times on the Arabian Sea coast."],
  ["Dwarkadhish Temple", "Krishna", "Gujarat", "Dwarka", "Hindu", 22.2379, 68.9677, "Ancient Krishna temple and one of the Char Dham."],
  ["Palitana Temples", "Adinath", "Gujarat", "Palitana", "Jain", 21.5260, 71.8260, "Over 800 Jain temples on Shatrunjaya hill."],
  ["Dilwara Temples", "Tirthankaras", "Rajasthan", "Mount Abu", "Jain", 24.6106, 72.7183, "Marble Jain temples famous for delicate carving."],
  ["Brahma Temple", "Brahma", "Rajasthan", "Pushkar", "Hindu", 26.4881, 74.5539, "One of very few temples dedicated to Brahma."],
  ["Siddhivinayak Temple", "Ganesha", "Maharashtra", "Mumbai", "Hindu", 19.0170, 72.8302, "Popular Ganesha temple in Prabhadevi."],
  ["Kailasa Temple, Ellora", "Shiva", "Maharashtra", "Ellora", "Hindu", 20.0258, 75.1790, "Entire temple carved top-down from a single rock."],
  ["Shirdi Sai Baba Temple", "Sai Baba", "Maharashtra", "Shirdi", "Hindu", 19.7668, 74.4763, "Pilgrimage site of the saint Sai Baba."],
  ["Mahakaleshwar Temple", "Shiva", "Madhya Pradesh", "Ujjain", "Hindu", 23.1828, 75.7682, "Jyotirlinga famous for its Bhasma Aarti."],
  ["Khajuraho Kandariya Mahadeva", "Shiva", "Madhya Pradesh", "Khajuraho", "Hindu", 24.8519, 79.9199, "Largest of the Khajuraho group, rich in sculpture."],
  ["Kamakhya Temple", "Kamakhya", "Assam", "Guwahati", "Hindu", 26.1664, 91.7054, "Shakti Peetha on Nilachal Hill."],
  ["Dakshineswar Kali Temple", "Kali", "West Bengal", "Kolkata", "Hindu", 22.6551, 88.3576, "Associated with Ramakrishna, on the Hooghly river."],
  ["Mahabodhi Temple", "Buddha", "Bihar", "Bodh Gaya", "Buddhist", 24.6961, 84.9911, "Site of the Buddha's enlightenment; UNESCO World Heritage Site."],
  ["Tawang Monastery", "Buddha", "Arunachal Pradesh", "Tawang", "Buddhist", 27.5866, 91.8650, "Largest monastery in India, high in the eastern Himalaya."],
  ["Hemis Monastery", "Buddha", "Ladakh", "Leh", "Buddhist", 33.9120, 77.7040, "Tibetan Buddhist monastery known for its annual festival."],
  ["Ranakpur Jain Temple", "Adinath", "Rajasthan", "Ranakpur", "Jain", 25.1186, 73.4713, "15th-century marble temple with 1,444 unique pillars."],
  ["Amarnath Cave Temple", "Shiva", "Jammu and Kashmir", "Pahalgam", "Hindu", 34.2148, 75.5006, "High-altitude cave shrine with an ice lingam."],
];

export function seed(db: Db): void {
  const ins = db.prepare("INSERT INTO temples (name, deity, state, city, tradition, lat, lng, description) VALUES (?,?,?,?,?,?,?,?)");
  db.transaction(() => TEMPLES.forEach((r) => ins.run(...r)))();
}

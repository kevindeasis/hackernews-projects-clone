import { Link, Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import PuzzlePage from "./pages/PuzzlePage";
import Stats from "./pages/Stats";

export default function App() {
  return (
    <div className="app">
      <header>
        <Link to="/" className="brand">Extreme Puzzles</Link>
        <nav><Link to="/">Books</Link><Link to="/stats">Stats</Link></nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/puzzle/:id" element={<PuzzlePage />} />
          <Route path="/stats" element={<Stats />} />
        </Routes>
      </main>
    </div>
  );
}

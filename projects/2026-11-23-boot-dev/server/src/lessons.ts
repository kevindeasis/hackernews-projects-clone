// Course content. Each lesson is graded by `tests`.
// JS lessons: each test evaluates `call` after the learner's code and compares to `expected` (JSON).
// SQL lessons: the learner's query runs against an in-memory SQLite seeded by `setup`; rows compared to `expectedQuery`.
export type JsTest = { call: string; expected: unknown };
export type Lesson = {
  id: string;
  course: string;
  title: string;
  xp: number;
  instructions: string;
  starter: string;
  kind: "js" | "sql";
  tests?: JsTest[];
  setup?: string;
  expectedQuery?: string;
  orderMatters?: boolean;
};
export type Course = { id: string; title: string; description: string; kind: "js" | "sql" };

export const courses: Course[] = [
  { id: "js", title: "Learn JavaScript", description: "Functions, arrays and objects by writing real code.", kind: "js" },
  { id: "sql", title: "Learn SQL", description: "Query a real SQLite database.", kind: "sql" },
];

const shop = `
CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT, country TEXT);
CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER, total REAL);
INSERT INTO customers VALUES (1,'Ada','UK'),(2,'Linus','FI'),(3,'Grace','US'),(4,'Alan','UK');
INSERT INTO orders VALUES (1,1,30),(2,1,20),(3,2,15),(4,3,100),(5,3,50),(6,4,5);
`;

export const lessons: Lesson[] = [
  {
    id: "js-1", course: "js", kind: "js", title: "Functions", xp: 10,
    instructions: "Write a function `add(a, b)` that returns the sum of its arguments.",
    starter: "function add(a, b) {\n  // your code here\n}\n",
    tests: [{ call: "add(2,3)", expected: 5 }, { call: "add(-1,1)", expected: 0 }],
  },
  {
    id: "js-2", course: "js", kind: "js", title: "Conditionals", xp: 15,
    instructions: "Write `fizzbuzz(n)` returning 'Fizz' for multiples of 3, 'Buzz' for 5, 'FizzBuzz' for both, otherwise the number.",
    starter: "function fizzbuzz(n) {\n}\n",
    tests: [{ call: "fizzbuzz(3)", expected: "Fizz" }, { call: "fizzbuzz(10)", expected: "Buzz" }, { call: "fizzbuzz(15)", expected: "FizzBuzz" }, { call: "fizzbuzz(7)", expected: 7 }],
  },
  {
    id: "js-3", course: "js", kind: "js", title: "Arrays", xp: 20,
    instructions: "Write `sumEvens(nums)` that returns the sum of the even numbers in an array.",
    starter: "function sumEvens(nums) {\n}\n",
    tests: [{ call: "sumEvens([1,2,3,4])", expected: 6 }, { call: "sumEvens([])", expected: 0 }, { call: "sumEvens([7,9])", expected: 0 }],
  },
  {
    id: "js-4", course: "js", kind: "js", title: "Objects", xp: 25,
    instructions: "Write `countWords(text)` returning an object mapping each lowercase word to how many times it appears.",
    starter: "function countWords(text) {\n}\n",
    tests: [{ call: "countWords('a b a')", expected: { a: 2, b: 1 } }, { call: "countWords('Go go GO')", expected: { go: 3 } }],
  },
  {
    id: "js-5", course: "js", kind: "js", title: "Recursion", xp: 30,
    instructions: "Write `fib(n)` returning the n-th Fibonacci number (fib(0)=0, fib(1)=1).",
    starter: "function fib(n) {\n}\n",
    tests: [{ call: "fib(0)", expected: 0 }, { call: "fib(1)", expected: 1 }, { call: "fib(10)", expected: 55 }],
  },
  {
    id: "sql-1", course: "sql", kind: "sql", title: "SELECT", xp: 10, setup: shop,
    instructions: "Tables: customers(id,name,country), orders(id,customer_id,total). Select the `name` of every customer.",
    starter: "SELECT\n", expectedQuery: "SELECT name FROM customers",
  },
  {
    id: "sql-2", course: "sql", kind: "sql", title: "WHERE", xp: 15, setup: shop,
    instructions: "Select the names of customers whose country is 'UK'.",
    starter: "SELECT name FROM customers\n", expectedQuery: "SELECT name FROM customers WHERE country = 'UK'",
  },
  {
    id: "sql-3", course: "sql", kind: "sql", title: "JOIN", xp: 25, setup: shop,
    instructions: "Return each customer `name` with the `total` of each of their orders (columns: name, total).",
    starter: "SELECT\n", expectedQuery: "SELECT c.name, o.total FROM customers c JOIN orders o ON o.customer_id = c.id",
  },
  {
    id: "sql-4", course: "sql", kind: "sql", title: "GROUP BY", xp: 30, setup: shop, orderMatters: true,
    instructions: "Return each customer `name` and their `spent` (sum of order totals), highest spender first.",
    starter: "SELECT\n",
    expectedQuery: "SELECT c.name, SUM(o.total) AS spent FROM customers c JOIN orders o ON o.customer_id = c.id GROUP BY c.id ORDER BY spent DESC",
  },
];

export const getLesson = (id: string) => lessons.find((l) => l.id === id);

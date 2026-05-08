1. Create an event  (POST /api/events)
2. Get all events   (GET /api/events)
3. Get one event    (GET /api/events/:id)
4. 

1. Register an attendee for an event  (POST /api/attendees)
2. Get all attendees for an event     (GET /api/attendees/event/:eventId)
3. Check in an attendee               (PATCH /api/attendees/:id/checkin)

      steps to follow creating a new feature.
Step 1: Create the database table (MySQL)
Step 2: Create the controller (business logic)
Step 3: Create middleware if needed (validation, existence)
Step 4: Create the route (connect URL to controller)
Step 5: Register route in server.js
Step 6: Test in Postman

1. how express routes works
every route follows this path router.METHOD('/PATH', controllerFunction);
example router.post('/', registerAttendee);
controller function is what runs when the URL is hit

2. how controller works
every controller follows this exact pattern
const doSomething = async (req, res) => {
  try {
    // 1. Get data from request
    // 2. Validate the data
    // 3. Talk to database
    // 4. Send response
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

3. the request object(req)
is what the client sends to you
req.body        // data sent in POST/PATCH request body
req.params      // data in the URL  e.g /events/:id  → req.params.id
req.query       // data in URL query e.g /events?type=internal → req.query.type

example:

// URL: /api/events/5
const id = req.params.id  // id = 5

// Body: { "name": "Tech Summit" }
const name = req.body.name  // name = "Tech Summit"

// URL: /api/events?type=internal
const type = req.query.type  // type = "internal"

4. the response object(res)
it what you send back
res.status(200).json({ })   // success - data found
res.status(201).json({ })   // success - something created
res.status(400).json({ })   // client error - bad request
res.status(404).json({ })   // not found
res.status(500).json({ })   // server error
 
simple rule to remember
2xx = Success
4xx = Client did something wrong
5xx = Server did something wrong

5.  database queries
every db operation follows this pattern
const [result] = await db.query('SQL QUERY HERE', [values]);
here's the four operation you will see
// READ - get data
const [rows] = await db.query('SELECT * FROM events');

// READ ONE - get single item
const [rows] = await db.query(
  'SELECT * FROM events WHERE id = ?', 
  [id]  // ? gets replaced by id safely
);

// CREATE - insert data
const [result] = await db.query(
  'INSERT INTO events (name, date) VALUES (?, ?)',
  [name, date]
);

// UPDATE - change data
await db.query(
  'UPDATE events SET name = ? WHERE id = ?',
  [name, id]
);

// DELETE - remove data
await db.query(
  'DELETE FROM events WHERE id = ?', 
  [id]
);

we use ? instead of writing values directly to  protect against SQL injection — hackers trying to break your database.

6.  async/await
database takes time to respond. async/await makes the code wait:
Without async/await - code doesn't wait, causes bugs
const getData = (req, res) => {
  const [rows] = db.query('SELECT * FROM events'); // doesn't wait!
  res.json(rows); // sends empty data
};

With async/await - code waits properly
const getData = async (req, res) => {
  const [rows] = await db.query('SELECT * FROM events'); // waits!
  res.json(rows); // sends actual data
};
Simple rule: if you use await, the function must be async

7. validation pattern
always validate before touching the db

The Formula to Write Any Feature
Whenever you need a new feature, ask yourself these questions:
1. What HTTP method? (GET, POST, PATCH, DELETE)
2. What URL path?
3. What data comes in? (req.body, req.params, req.query)
4. What validation is needed?
5. What SQL query do I need?
6. What do I send back?

Your MVP = 3-4 working features:
1. Create & View Events
A form where someone fills in event name, type, date, budget, location
A dashboard that lists all events in one place
That alone already replaces the spreadsheet chaos

2. Attendee Registration & Tracking
People can register for an event
Organizer sees who's coming in real time
Maybe a simple QR code check-in on the day

3. Basic Budget Tracking
Enter planned budget vs actual spend
Simple visual showing if you're over or under budget

4. Post-Event Feedback
A simple form attendees fill after the event
Results show up on a dashboard

What your demo flow looks like:
Create an event
Register some attendees
Check them in
Submit feedback
Show the dashboard with all the data

That's a complete story, start to finish
window.PROJECT = {
  "slug": "uni-email-to-tasks",
  "tab": "Uni Email to Tasks",
  "title": "My university inbox, turned into a to-do list",
  "badge": "Built for my own studies",
  "idea": "Every hour, an agent reads my unread UCAS emails. New lectures become Google Tasks, and assignments and quizzes go on Google Calendar with reminders. Then one tidy report arrives on Telegram, so I don't have to open the inbox.",
  "problem": "Moodle and university emails don't notify me unless I open the inbox. Lectures, assignments and quizzes get buried under 70+ unread emails, deadlines slip past, and I can't easily tell what's piling up and what I've already finished.",
  "stack": [
    "n8n",
    "Google Gemini (free tier)",
    "Gmail",
    "Google Tasks",
    "Google Calendar",
    "Telegram Bot API"
  ],
  "decisions": [
    [
      "One agent, no sub-agents",
      "n8n already runs the agent once per email, and one agent can call several tools for a single email. Sub-agents would only double the model calls."
    ],
    [
      "Search before creating",
      "The agent checks Google Tasks and the calendar first. A reminder email or a repeated announcement doesn't create a second copy."
    ],
    [
      "Never guess a date",
      "If an email has no clear deadline or time, nothing goes on the calendar. The report flags it so I check Moodle myself."
    ],
    [
      "The model decides, the code formats",
      "The agent returns plain JSON about what it did. A Code node turns that into the Telegram report, so the layout is the same every time."
    ],
    [
      "Built to run free",
      "Gemini's free tier allows 5 requests a minute. The agent handles one email at a time, waits between emails and retries on failure."
    ]
  ],
  "lessons": [
    [
      "The agent was reading empty emails: every subject came through as \"(no subject)\".",
      "Gmail Trigger's Simplify mode drops the body and capitalises field names. I turned it off, and the clean-up step now reads both formats."
    ],
    [
      "Task and event fields were fixed values, so every event landed on the current time.",
      "Every field is now filled by the model through $fromAI, with a clear description for each one."
    ],
    [
      "Three emails at once hit 429 Too Many Requests on the free tier.",
      "Batching of one email at a time, a 45-second gap and automatic retries."
    ],
    [
      "A 23:59 deadline showed as 23:29 in the report, because the event ended at the deadline.",
      "Deadline events now start at the deadline, so the reminder a day before is exact too."
    ],
    [
      "Lines that mixed Arabic and English course names lined up on the wrong side in Telegram.",
      "Every line starts with a right-to-left mark."
    ],
    [
      "Gaza switches between UTC+2 and UTC+3.",
      "The prompt gets the current offset at run time instead of a hard-coded one."
    ]
  ],
  "traces": [
    {
      "label": "A new lecture",
      "ask": "📧 New content in برمجة للذكاء الاصطناعي",
      "steps": [
        ["Gmail Trigger", "The hourly check finds an unread Moodle email."],
        ["Clean Email", "Strips the HTML and keeps sender, subject, date, link and body."],
        ["AI Agent", "\"added a new URL\" means lecture material. The course is the part before the instructor's name."],
        ["Gemini", "Free-tier Gemini does the reading and the deciding."],
        ["get_tasks", "Checks the task isn't already there."],
        ["create_task", "📚 برمجة للذكاء الاصطناعي - Chapter 2 numpy part 2, due today."],
        ["AI Agent", "Returns JSON: one task added."],
        ["Build Report", "Turns it into a checklist line with the course underneath."],
        ["Send Report", "☐ 📚 Chapter 2 numpy part 2 · برمجة للذكاء الاصطناعي · اليوم"]
      ]
    },
    {
      "label": "Assignment + quiz in one email",
      "ask": "📧 Assignment 2 is due next Sunday 11:59 PM. Quiz 1 on Tuesday 10 AM in B204.",
      "steps": [
        ["Gmail Trigger", "One email from the instructor."],
        ["Clean Email", "Same clean shape as every other email."],
        ["AI Agent", "Finds two items in one email and resolves \"next Sunday\" and \"Tuesday\" from today's date."],
        ["get_tasks", "Is the assignment already a task?"],
        ["get_events", "Anything on Sunday or Tuesday already?"],
        ["create_task", "📝 Database Systems - Assignment 2, due Sunday."],
        ["create_event", "⏰ Deadline at 23:59 on Sunday, with reminders a day and an hour before."],
        ["create_event", "🧪 Quiz 1, Tuesday 10:00–10:30, room B204."],
        ["AI Agent", "One task and two events, all in its JSON."],
        ["Build Report", "Tasks and calendar items go in separate sections."],
        ["Send Report", "Everything from one email, in one message."]
      ]
    },
    {
      "label": "No deadline in the email",
      "ask": "📧 A new assignment was added in شبكات الحاسوب",
      "steps": [
        ["Gmail Trigger", "Moodle says there's a new assignment and nothing else."],
        ["Clean Email", "Cleaned."],
        ["AI Agent", "It's an assignment, but no date is given, and it won't guess one."],
        ["get_tasks", "Not there yet."],
        ["create_task", "Added with today's date, so it's on my list now."],
        ["AI Agent", "No calendar event. It adds a warning instead."],
        ["Build Report", "The warning gets its own ⚠️ section, with a link to the email."],
        ["Send Report", "❗ الايميل ما فيه ديدلاين — شوفيه عالمودل"]
      ]
    },
    {
      "label": "The same email twice",
      "ask": "📧 Reminder: Assignment 2 is due Sunday",
      "steps": [
        ["Gmail Trigger", "A reminder about something already handled."],
        ["Clean Email", "Cleaned."],
        ["AI Agent", "Checks before it creates anything."],
        ["get_tasks", "📝 Assignment 2 is already there."],
        ["get_events", "So is the deadline on Sunday."],
        ["AI Agent", "Creates nothing and lists both as duplicates."],
        ["Build Report", "🔁 Already there, not repeated."],
        ["Send Report", "No double tasks, no double reminders."]
      ]
    },
    {
      "label": "Not about uni",
      "ask": "📧 Get off to a flying start",
      "steps": [
        ["Gmail Trigger", "An unread newsletter."],
        ["Clean Email", "Cleaned, invisible newsletter characters included."],
        ["AI Agent", "Not academic, so it touches nothing."],
        ["Build Report", "Listed under emails that aren't about uni."],
        ["Send Report", "📭 one line, then out of the way."]
      ]
    }
  ],
  "setup": [
    "Connect Gmail, Google Gemini, Google Tasks, Google Calendar and Telegram credentials.",
    "Replace YOUR_GOOGLE_TASKLIST_ID, YOUR_CALENDAR_ID and YOUR_TELEGRAM_CHAT_ID.",
    "Set the workflow timezone to yours, and change the university name and timezone at the top of the agent's prompt.",
    "Message your Telegram bot once with /start so it's allowed to message you, then publish."
  ],
  "signature": {
    "title": "What happens to each email",
    "sub": "These are the kinds of emails I actually get. Pick one to see what the agent does with it.",
    "style": "cols3",
    "prompt": "Pick an email above.",
    "items": [
      {
        "time": "Moodle",
        "label": "📚 New lecture uploaded",
        "tag": "→ Google Tasks",
        "trace": 0,
        "text": "It becomes a task named after the course and the lecture, due today, so I know what to catch up on."
      },
      {
        "time": "Instructor",
        "label": "📝 Assignment + 🧪 quiz",
        "tag": "→ Tasks + Calendar",
        "trace": 1,
        "text": "A task for the assignment, a deadline on the calendar, the quiz at its exact time and room, and reminders a day and an hour before each."
      },
      {
        "time": "Moodle",
        "label": "❓ Assignment, no deadline",
        "tag": "→ Task + warning",
        "trace": 2,
        "text": "It still makes the task, but it won't invent a date. The report tells me to check Moodle."
      },
      {
        "time": "Reminder",
        "label": "🔁 Same assignment again",
        "tag": "→ Nothing new",
        "trace": 3,
        "text": "It searches first, finds the task and the event, and creates nothing."
      },
      {
        "time": "Newsletter",
        "label": "📭 Not about uni",
        "tag": "→ Ignored",
        "trace": 4,
        "text": "It gets one line at the bottom of the report and nothing else."
      },
      {
        "time": "Every hour",
        "label": "📲 One Telegram report",
        "tag": "→ My to-do list",
        "trace": 1,
        "text": "New tasks, calendar items, warnings, duplicates and ignored emails, each in its own section. No new email means no message."
      }
    ]
  }
};

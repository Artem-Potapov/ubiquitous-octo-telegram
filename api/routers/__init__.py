from api.routers import access, checkins, demo, gaps, networks, people, tasks

ALL_ROUTERS = [
    demo.router,
    people.router,
    networks.router,
    tasks.router,
    gaps.router,
    checkins.router,
    access.router,
]

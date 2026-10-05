"""
Enhanced Workout Recommendation System
Provides comprehensive gym-based exercise database and progressive training plans
"""

# Comprehensive Gym Exercise Database (Expanded)
EXERCISE_DATABASE = {
    # ════ PUSH (胸 / 三頭 / 前中三角) ════════════════════════════════════════
    "push": {
        "beginner": [
            {"name": "Machine Chest Press",            "sets": 3, "reps": "10-12",  "rest": "60s",  "difficulty": 1, "equipment": "machine",    "target": "chest"},
            {"name": "Dumbbell Bench Press",            "sets": 3, "reps": "10-12",  "rest": "60s",  "difficulty": 2, "equipment": "dumbbell",   "target": "chest"},
            {"name": "Incline Machine Press",           "sets": 3, "reps": "10-12",  "rest": "60s",  "difficulty": 2, "equipment": "machine",    "target": "chest_upper"},
            {"name": "Seated Dumbbell Shoulder Press",  "sets": 3, "reps": "10-12",  "rest": "60s",  "difficulty": 2, "equipment": "dumbbell",   "target": "delt_front"},
            {"name": "Cable Chest Fly",                 "sets": 3, "reps": "12-15",  "rest": "45s",  "difficulty": 2, "equipment": "cable",      "target": "chest"},
            {"name": "Triceps Cable Pushdown",          "sets": 3, "reps": "12-15",  "rest": "45s",  "difficulty": 1, "equipment": "cable",      "target": "triceps"},
            {"name": "Lateral Raise Machine",           "sets": 3, "reps": "12-15",  "rest": "45s",  "difficulty": 1, "equipment": "machine",    "target": "delt_side"},
        ],
        "intermediate": [
            {"name": "Barbell Bench Press",             "sets": 4, "reps": "8-10",   "rest": "90s",  "difficulty": 3, "equipment": "barbell",    "target": "chest"},
            {"name": "Incline Dumbbell Press",          "sets": 3, "reps": "10-12",  "rest": "60s",  "difficulty": 3, "equipment": "dumbbell",   "target": "chest_upper"},
            {"name": "Overhead Barbell Press",          "sets": 3, "reps": "8-10",   "rest": "90s",  "difficulty": 4, "equipment": "barbell",    "target": "delt_front"},
            {"name": "Cable Crossover",                 "sets": 3, "reps": "12-15",  "rest": "60s",  "difficulty": 3, "equipment": "cable",      "target": "chest"},
            {"name": "Dumbbell Lateral Raises",         "sets": 3, "reps": "12-15",  "rest": "45s",  "difficulty": 2, "equipment": "dumbbell",   "target": "delt_side"},
            {"name": "Skull Crushers",                  "sets": 3, "reps": "10-12",  "rest": "60s",  "difficulty": 3, "equipment": "barbell",    "target": "triceps"},
            {"name": "Overhead Triceps Extension",      "sets": 3, "reps": "10-12",  "rest": "60s",  "difficulty": 3, "equipment": "cable",      "target": "triceps"},
            {"name": "Pec Deck Machine",                "sets": 3, "reps": "12-15",  "rest": "60s",  "difficulty": 2, "equipment": "machine",    "target": "chest"},
        ],
        "advanced": [
            {"name": "Heavy Bench Press",               "sets": 5, "reps": "5",      "rest": "120s", "difficulty": 5, "equipment": "barbell",    "target": "chest"},
            {"name": "Weighted Dips",                   "sets": 4, "reps": "8-10",   "rest": "90s",  "difficulty": 5, "equipment": "bodyweight", "target": "triceps"},
            {"name": "Decline Barbell Press",           "sets": 4, "reps": "8-10",   "rest": "90s",  "difficulty": 4, "equipment": "barbell",    "target": "chest_lower"},
            {"name": "Arnold Press",                    "sets": 4, "reps": "10-12",  "rest": "60s",  "difficulty": 4, "equipment": "dumbbell",   "target": "delt_front"},
            {"name": "Cable Flyes (High to Low)",       "sets": 3, "reps": "12-15",  "rest": "45s",  "difficulty": 3, "equipment": "cable",      "target": "chest_lower"},
            {"name": "Close-Grip Bench Press",          "sets": 4, "reps": "8-10",   "rest": "90s",  "difficulty": 4, "equipment": "barbell",    "target": "triceps"},
            # Reverse Pec Deck 是後三角動作，移到 pull 日，push 日改為 Push Press
            {"name": "Push Press",                      "sets": 4, "reps": "6-8",    "rest": "90s",  "difficulty": 4, "equipment": "barbell",    "target": "delt_front"},
        ]
    },
    # ════ PULL (背部 / 二頭 / 後三角) ════════════════════════════════════════
    "pull": {
        "beginner": [
            {"name": "Lat Pulldown (Machine)",          "sets": 3, "reps": "10-12",  "rest": "60s",  "difficulty": 2, "equipment": "machine",    "target": "back_width"},
            {"name": "Seated Cable Row",                "sets": 3, "reps": "10-12",  "rest": "60s",  "difficulty": 2, "equipment": "cable",      "target": "back_thickness"},
            {"name": "Machine Row",                     "sets": 3, "reps": "10-12",  "rest": "60s",  "difficulty": 1, "equipment": "machine",    "target": "back_thickness"},
            {"name": "Dumbbell Bicep Curls",            "sets": 3, "reps": "12-15",  "rest": "45s",  "difficulty": 1, "equipment": "dumbbell",   "target": "biceps"},
            {"name": "Cable Bicep Curls",               "sets": 3, "reps": "12-15",  "rest": "45s",  "difficulty": 1, "equipment": "cable",      "target": "biceps"},
            {"name": "Assisted Pull-up Machine",        "sets": 3, "reps": "8-10",   "rest": "60s",  "difficulty": 2, "equipment": "machine",    "target": "back_width"},
        ],
        "intermediate": [
            {"name": "Pull-ups (BW or Assisted)",       "sets": 3, "reps": "8-10",   "rest": "90s",  "difficulty": 4, "equipment": "bodyweight", "target": "back_width"},
            {"name": "Barbell Bent Over Row",           "sets": 4, "reps": "8-10",   "rest": "90s",  "difficulty": 4, "equipment": "barbell",    "target": "back_thickness"},
            {"name": "Cable Face Pulls",                "sets": 3, "reps": "12-15",  "rest": "45s",  "difficulty": 2, "equipment": "cable",      "target": "delt_rear"},
            {"name": "Reverse Pec Deck",                "sets": 3, "reps": "12-15",  "rest": "45s",  "difficulty": 2, "equipment": "machine",    "target": "delt_rear"},
            {"name": "Dumbbell Hammer Curls",           "sets": 3, "reps": "10-12",  "rest": "60s",  "difficulty": 2, "equipment": "dumbbell",   "target": "biceps"},
            {"name": "Wide Grip Lat Pulldown",          "sets": 3, "reps": "10-12",  "rest": "60s",  "difficulty": 3, "equipment": "cable",      "target": "back_width"},
            {"name": "Single Arm Cable Row",            "sets": 3, "reps": "10-12",  "rest": "60s",  "difficulty": 3, "equipment": "cable",      "target": "back_thickness"},
            {"name": "EZ Bar Curls",                    "sets": 3, "reps": "10-12",  "rest": "60s",  "difficulty": 2, "equipment": "barbell",    "target": "biceps"},
        ],
        "advanced": [
            {"name": "Weighted Pull-ups",               "sets": 4, "reps": "5-8",    "rest": "120s", "difficulty": 6, "equipment": "bodyweight", "target": "back_width"},
            {"name": "T-Bar Row",                       "sets": 4, "reps": "8-10",   "rest": "90s",  "difficulty": 5, "equipment": "barbell",    "target": "back_thickness"},
            {"name": "Pendlay Row",                     "sets": 4, "reps": "6-8",    "rest": "90s",  "difficulty": 5, "equipment": "barbell",    "target": "back_thickness"},
            {"name": "One-Arm Dumbbell Row",            "sets": 3, "reps": "10-12",  "rest": "60s",  "difficulty": 4, "equipment": "dumbbell",   "target": "back_thickness"},
            {"name": "Preacher Curls",                  "sets": 3, "reps": "10-12",  "rest": "60s",  "difficulty": 3, "equipment": "barbell",    "target": "biceps"},
            {"name": "Cable Straight-Arm Pulldown",     "sets": 3, "reps": "12-15",  "rest": "60s",  "difficulty": 3, "equipment": "cable",      "target": "back_width"},
            {"name": "Concentration Curls",             "sets": 3, "reps": "10-12",  "rest": "45s",  "difficulty": 3, "equipment": "dumbbell",   "target": "biceps"},
            {"name": "Bent-Over Reverse Fly",           "sets": 3, "reps": "12-15",  "rest": "60s",  "difficulty": 3, "equipment": "dumbbell",   "target": "delt_rear"},
        ]
    },
    # ════ LEGS (股四頭 / 臀大肌 / 腿後側 / 小腿) ══════════════════════════════
    "legs": {
        "beginner": [
            {"name": "Leg Press Machine",               "sets": 3, "reps": "12-15",  "rest": "90s",  "difficulty": 1, "equipment": "machine",    "target": "quads"},
            {"name": "Goblet Squats",                   "sets": 3, "reps": "10-12",  "rest": "60s",  "difficulty": 2, "equipment": "dumbbell",   "target": "quads"},
            {"name": "Leg Extension Machine",           "sets": 3, "reps": "12-15",  "rest": "60s",  "difficulty": 1, "equipment": "machine",    "target": "quads"},
            {"name": "Lying Leg Curl Machine",          "sets": 3, "reps": "12-15",  "rest": "60s",  "difficulty": 1, "equipment": "machine",    "target": "hamstrings"},
            {"name": "Smith Machine Squat",             "sets": 3, "reps": "10-12",  "rest": "90s",  "difficulty": 2, "equipment": "machine",    "target": "quads"},
            {"name": "Seated Calf Raise Machine",       "sets": 3, "reps": "15-20",  "rest": "45s",  "difficulty": 1, "equipment": "machine",    "target": "calves"},
        ],
        "intermediate": [
            {"name": "Barbell Back Squat",              "sets": 4, "reps": "8-10",   "rest": "120s", "difficulty": 5, "equipment": "barbell",    "target": "quads"},
            {"name": "Romanian Deadlift",               "sets": 3, "reps": "10-12",  "rest": "90s",  "difficulty": 4, "equipment": "barbell",    "target": "hamstrings"},
            {"name": "Dumbbell Walking Lunges",         "sets": 3, "reps": "12 steps","rest": "60s", "difficulty": 3, "equipment": "dumbbell",   "target": "quads"},
            {"name": "Leg Press (Heavy)",               "sets": 4, "reps": "10-12",  "rest": "90s",  "difficulty": 3, "equipment": "machine",    "target": "quads"},
            {"name": "Standing Calf Raises",            "sets": 4, "reps": "15-20",  "rest": "45s",  "difficulty": 2, "equipment": "machine",    "target": "calves"},
            {"name": "Hack Squat Machine",              "sets": 3, "reps": "10-12",  "rest": "90s",  "difficulty": 3, "equipment": "machine",    "target": "quads"},
            {"name": "Cable Glute Kickbacks",           "sets": 3, "reps": "12-15",  "rest": "60s",  "difficulty": 2, "equipment": "cable",      "target": "glutes"},
        ],
        "advanced": [
            {"name": "Front Squat",                     "sets": 4, "reps": "6-8",    "rest": "120s", "difficulty": 6, "equipment": "barbell",    "target": "quads"},
            {"name": "Bulgarian Split Squats",          "sets": 3, "reps": "10-12",  "rest": "90s",  "difficulty": 5, "equipment": "dumbbell",   "target": "quads"},
            {"name": "Sumo Deadlift",                   "sets": 4, "reps": "6-8",    "rest": "120s", "difficulty": 5, "equipment": "barbell",    "target": "hamstrings"},
            {"name": "Leg Extensions (Drop Sets)",      "sets": 3, "reps": "15-20",  "rest": "60s",  "difficulty": 4, "equipment": "machine",    "target": "quads"},
            {"name": "Nordic Hamstring Curls",          "sets": 3, "reps": "6-8",    "rest": "90s",  "difficulty": 6, "equipment": "bodyweight", "target": "hamstrings"},
            {"name": "Barbell Hip Thrust",              "sets": 4, "reps": "10-12",  "rest": "90s",  "difficulty": 4, "equipment": "barbell",    "target": "glutes"},
            {"name": "Pistol Squats",                   "sets": 3, "reps": "8-10",   "rest": "60s",  "difficulty": 6, "equipment": "bodyweight", "target": "quads"},
        ]
    },
    # ════ CORE (核心) ══════════════════════════════════════════════════════════
    "core": {
        "beginner": [
            {"name": "Plank",                           "sets": 3, "reps": "20-30s", "rest": "45s",  "difficulty": 1, "equipment": "bodyweight", "target": "core"},
            {"name": "Crunch Machine",                  "sets": 3, "reps": "12-15",  "rest": "45s",  "difficulty": 2, "equipment": "machine",    "target": "abs"},
            {"name": "Cable Crunches",                  "sets": 3, "reps": "12-15",  "rest": "45s",  "difficulty": 2, "equipment": "cable",      "target": "abs"},
            {"name": "Dead Bug",                        "sets": 3, "reps": "10-12",  "rest": "45s",  "difficulty": 1, "equipment": "bodyweight", "target": "core"},
        ],
        "intermediate": [
            {"name": "Cable Woodchoppers",              "sets": 3, "reps": "12-15",  "rest": "45s",  "difficulty": 3, "equipment": "cable",      "target": "obliques"},
            {"name": "Hanging Leg Raises",              "sets": 3, "reps": "10-12",  "rest": "60s",  "difficulty": 4, "equipment": "bodyweight", "target": "abs"},
            {"name": "Russian Twists (Weighted)",       "sets": 3, "reps": "20 total","rest": "45s", "difficulty": 3, "equipment": "dumbbell",   "target": "obliques"},
            {"name": "Cable Pallof Press",              "sets": 3, "reps": "10-12",  "rest": "60s",  "difficulty": 3, "equipment": "cable",      "target": "core"},
        ],
        "advanced": [
            {"name": "Ab Rollout",                      "sets": 3, "reps": "10-12",  "rest": "60s",  "difficulty": 5, "equipment": "bodyweight", "target": "core"},
            {"name": "Weighted Decline Crunches",       "sets": 3, "reps": "12-15",  "rest": "60s",  "difficulty": 4, "equipment": "machine",    "target": "abs"},
            {"name": "Dragon Flags",                    "sets": 3, "reps": "6-8",    "rest": "90s",  "difficulty": 6, "equipment": "bodyweight", "target": "core"},
            {"name": "One-Arm Farmers Carry",           "sets": 3, "reps": "30s each","rest": "60s", "difficulty": 4, "equipment": "dumbbell",   "target": "core"},
        ]
    },
    # ════ SHOULDERS (前/中/後三角) ════════════════════════════════════════════
    "shoulders": {
        "beginner": [
            {"name": "Machine Shoulder Press",          "sets": 3, "reps": "10-12",  "rest": "60s",  "difficulty": 1, "equipment": "machine",    "target": "delt_front"},
            {"name": "Dumbbell Front Raises",           "sets": 3, "reps": "12-15",  "rest": "45s",  "difficulty": 1, "equipment": "dumbbell",   "target": "delt_front"},
            {"name": "Cable Lateral Raises",            "sets": 3, "reps": "12-15",  "rest": "45s",  "difficulty": 2, "equipment": "cable",      "target": "delt_side"},
        ],
        "intermediate": [
            {"name": "Barbell Overhead Press",          "sets": 4, "reps": "8-10",   "rest": "90s",  "difficulty": 4, "equipment": "barbell",    "target": "delt_front"},
            {"name": "Dumbbell Lateral Raises",         "sets": 3, "reps": "12-15",  "rest": "60s",  "difficulty": 2, "equipment": "dumbbell",   "target": "delt_side"},
            {"name": "Cable Face Pulls",                "sets": 3, "reps": "15-20",  "rest": "45s",  "difficulty": 2, "equipment": "cable",      "target": "delt_rear"},
            {"name": "Reverse Pec Deck",                "sets": 3, "reps": "12-15",  "rest": "60s",  "difficulty": 2, "equipment": "machine",    "target": "delt_rear"},
        ],
        "advanced": [
            {"name": "Push Press",                      "sets": 4, "reps": "6-8",    "rest": "120s", "difficulty": 5, "equipment": "barbell",    "target": "delt_front"},
            {"name": "Arnold Press",                    "sets": 4, "reps": "10-12",  "rest": "60s",  "difficulty": 4, "equipment": "dumbbell",   "target": "delt_front"},
            {"name": "Cable Upright Rows",              "sets": 3, "reps": "10-12",  "rest": "60s",  "difficulty": 3, "equipment": "cable",      "target": "delt_side"},
            {"name": "Bent-Over Reverse Fly",           "sets": 3, "reps": "12-15",  "rest": "60s",  "difficulty": 3, "equipment": "dumbbell",   "target": "delt_rear"},
        ]
    },
    # ════ BACK (背部闊度 / 厚度) ══════════════════════════════════════════════
    "back": {
        "beginner": [
            {"name": "Lat Pulldown Machine",            "sets": 3, "reps": "10-12",  "rest": "60s",  "difficulty": 2, "equipment": "machine",    "target": "back_width"},
            {"name": "Seated Row Machine",              "sets": 3, "reps": "10-12",  "rest": "60s",  "difficulty": 1, "equipment": "machine",    "target": "back_thickness"},
            {"name": "Cable Straight-Arm Pulldown",     "sets": 3, "reps": "12-15",  "rest": "45s",  "difficulty": 2, "equipment": "cable",      "target": "back_width"},
        ],
        "intermediate": [
            {"name": "Barbell Row",                     "sets": 4, "reps": "8-10",   "rest": "90s",  "difficulty": 4, "equipment": "barbell",    "target": "back_thickness"},
            {"name": "Wide Grip Pull-ups",              "sets": 3, "reps": "8-10",   "rest": "90s",  "difficulty": 4, "equipment": "bodyweight", "target": "back_width"},
            {"name": "Cable Row (Various Grips)",       "sets": 3, "reps": "10-12",  "rest": "60s",  "difficulty": 3, "equipment": "cable",      "target": "back_thickness"},
        ],
        "advanced": [
            {"name": "Weighted Pull-ups",               "sets": 4, "reps": "6-8",    "rest": "120s", "difficulty": 6, "equipment": "bodyweight", "target": "back_width"},
            {"name": "T-Bar Row",                       "sets": 4, "reps": "8-10",   "rest": "90s",  "difficulty": 5, "equipment": "barbell",    "target": "back_thickness"},
            {"name": "Meadows Row",                     "sets": 3, "reps": "10-12",  "rest": "60s",  "difficulty": 5, "equipment": "barbell",    "target": "back_thickness"},
        ]
    }
}

def adjust_exercise_volume(exercises, goal, fitness_level):
    """
    Adjust exercise sets and reps based on user goals
    """
    adjusted = []
    for ex in exercises:
        exercise = ex.copy()
        
        # Reduce sets by 1 for all exercises (2-3 instead of 3-4)
        current_sets = exercise.get('sets', 3)
        exercise['sets'] = max(2, current_sets - 1)
        
        # Adjust based on goals
        if 'strength' in goal:
            # Lower reps, maintain sets
            if 'reps' in exercise and isinstance(exercise['reps'], str):
                if '-' in exercise['reps']:
                    low, high = exercise['reps'].split('-')[0], exercise['reps'].split('-')[1]
                    if high.replace('s', '').isdigit():
                        high_num = int(high.replace('s', ''))
                        if high_num > 12:
                            exercise['reps'] = "6-8"
                        elif high_num > 8:
                            exercise['reps'] = "5-6"
            exercise['rest'] = "90-120s"
        
        elif 'endurance' in goal:
            # Higher reps, shorter rest
            if fitness_level != 'beginner':
                exercise['sets'] = min(3, exercise['sets'] + 1)
            exercise['rest'] = "30-45s"
        
        elif 'weight_loss' in goal:
            # Moderate reps, short rest
            exercise['rest'] = "45-60s"
        
        adjusted.append(exercise)
    
    return adjusted

def get_comprehensive_workout_plan(user_id, profile):
    """
    Generate a comprehensive workout plan based on user profile and goals
    Customized volume and exercise selection based on training priorities
    """
    fitness_level = profile.get('fitness_level', 'beginner')
    goals = profile.get('goals', [])
    body_type = profile.get('body_type', 'beginner')
    
    # Determine primary focus from goals
    primary_focus = 'balanced'
    if 'strength' in goals:
        primary_focus = 'strength'
    elif 'endurance' in goals:
        primary_focus = 'endurance'
    elif 'weight_loss' in goals:
        primary_focus = 'fat_loss'
    
    # Select appropriate exercises based on fitness level
    base_exercises = {
        'push': EXERCISE_DATABASE['push'][fitness_level],
        'pull': EXERCISE_DATABASE['pull'][fitness_level],
        'legs': EXERCISE_DATABASE['legs'][fitness_level],
        'core': EXERCISE_DATABASE['core'][fitness_level],
        'shoulders': EXERCISE_DATABASE.get('shoulders', {}).get(fitness_level, []),
        'back': EXERCISE_DATABASE.get('back', {}).get(fitness_level, [])
    }
    
    # Adjust volume based on goals
    exercises = {}
    for muscle_group, exs in base_exercises.items():
        exercises[muscle_group] = adjust_exercise_volume(exs, goals, fitness_level)
    
    # Determine exercises per day based on fitness level and goals
    if fitness_level == 'beginner':
        exercises_per_day = 3 if primary_focus == 'strength' else 4
    elif fitness_level == 'intermediate':
        exercises_per_day = 4 if primary_focus == 'strength' else 5
    else:
        exercises_per_day = 5 if primary_focus == 'strength' else 6
    
    # 4-week progressive plan customized to goals
    if primary_focus == 'strength':
        weekly_plan = [
            {
                "week": 1,
                "focus": "Movement Patterns",
                "days": [
                    {"day": "Monday", "split": "Upper Push", "exercises": exercises['push'][:3]},
                    {"day": "Wednesday", "split": "Lower Body", "exercises": exercises['legs'][:3]},
                    {"day": "Friday", "split": "Upper Pull", "exercises": exercises['pull'][:3]},
                ]
            },
            {
                "week": 2,
                "focus": "Load Progression",
                "days": [
                    {"day": "Monday", "split": "Push + Shoulders", "exercises": exercises['push'][:2] + exercises['shoulders'][:1]},
                    {"day": "Wednesday", "split": "Legs", "exercises": exercises['legs'][:3]},
                    {"day": "Friday", "split": "Pull + Back", "exercises": exercises['pull'][:2] + exercises['back'][:1]},
                ]
            },
            {
                "week": 3,
                "focus": "Strength Peak",
                "days": [
                    {"day": "Monday", "split": "Upper Body", "exercises": exercises['push'][:2] + exercises['pull'][:1]},
                    {"day": "Wednesday", "split": "Lower Body", "exercises": exercises['legs'][:3]},
                    {"day": "Friday", "split": "Full Body Power", "exercises": exercises['push'][:1] + exercises['pull'][:1] + exercises['legs'][:1]},
                ]
            },
            {
                "week": 4,
                "focus": "Deload & Recovery",
                "days": [
                    {"day": "Monday", "split": "Push (Light)", "exercises": exercises['push'][:2]},
                    {"day": "Wednesday", "split": "Pull (Light)", "exercises": exercises['pull'][:2]},
                    {"day": "Friday", "split": "Legs (Light)", "exercises": exercises['legs'][:2]},
                ]
            }
        ]
    elif primary_focus == 'fat_loss':
        weekly_plan = [
            {
                "week": 1,
                "focus": "Metabolic Foundation",
                "days": [
                    {"day": "Monday", "split": "Full Body Circuit", "exercises": exercises['push'][:1] + exercises['pull'][:1] + exercises['legs'][:1] + exercises['core'][:1]},
                    {"day": "Wednesday", "split": "Upper Body", "exercises": exercises['push'][:2] + exercises['pull'][:2]},
                    {"day": "Friday", "split": "Lower + Core", "exercises": exercises['legs'][:2] + exercises['core'][:2]},
                ]
            },
            {
                "week": 2,
                "focus": "Volume Increase",
                "days": [
                    {"day": "Monday", "split": "Push + Core", "exercises": exercises['push'][:2] + exercises['core'][:2]},
                    {"day": "Wednesday", "split": "Pull + Legs", "exercises": exercises['pull'][:2] + exercises['legs'][:1]},
                    {"day": "Friday", "split": "Full Body", "exercises": exercises['push'][:1] + exercises['legs'][:2] + exercises['core'][:1]},
                ]
            },
            {
                "week": 3,
                "focus": "Intensity Peak",
                "days": [
                    {"day": "Monday", "split": "Upper Body", "exercises": exercises['push'][:2] + exercises['pull'][:2]},
                    {"day": "Wednesday", "split": "Lower Body", "exercises": exercises['legs'][:3] + exercises['core'][:1]},
                    {"day": "Friday", "split": "Circuit Training", "exercises": exercises['push'][:1] + exercises['pull'][:1] + exercises['legs'][:1] + exercises['core'][:1]},
                ]
            },
            {
                "week": 4,
                "focus": "Active Recovery",
                "days": [
                    {"day": "Monday", "split": "Upper Body", "exercises": exercises['push'][:2] + exercises['pull'][:1]},
                    {"day": "Wednesday", "split": "Lower + Core", "exercises": exercises['legs'][:2] + exercises['core'][:1]},
                    {"day": "Friday", "split": "Full Body Light", "exercises": exercises['push'][:1] + exercises['legs'][:1] + exercises['core'][:1]},
                ]
            }
        ]
    else:  # balanced or endurance
        weekly_plan = [
            {
                "week": 1,
                "focus": "Foundation & Form",
                "days": [
                    {"day": "Monday", "split": "Push", "exercises": exercises['push'][:3]},
                    {"day": "Wednesday", "split": "Pull", "exercises": exercises['pull'][:3]},
                    {"day": "Friday", "split": "Legs + Core", "exercises": exercises['legs'][:2] + exercises['core'][:1]},
                ]
            },
            {
                "week": 2,
                "focus": "Volume Increase",
                "days": [
                    {"day": "Monday", "split": "Push + Shoulders", "exercises": exercises['push'][:2] + exercises['shoulders'][:1]},
                    {"day": "Wednesday", "split": "Pull + Back", "exercises": exercises['pull'][:2] + exercises['back'][:1]},
                    {"day": "Friday", "split": "Legs + Core", "exercises": exercises['legs'][:2] + exercises['core'][:2]},
                ]
            },
            {
                "week": 3,
                "focus": "Variety & Challenge",
                "days": [
                    {"day": "Monday", "split": "Upper Body", "exercises": exercises['push'][:2] + exercises['pull'][:2]},
                    {"day": "Wednesday", "split": "Lower Body", "exercises": exercises['legs'][:3]},
                    {"day": "Friday", "split": "Full Body", "exercises": exercises['push'][:1] + exercises['pull'][:1] + exercises['legs'][:1] + exercises['core'][:1]},
                ]
            },
            {
                "week": 4,
                "focus": "Recovery Week",
                "days": [
                    {"day": "Monday", "split": "Push", "exercises": exercises['push'][:2]},
                    {"day": "Wednesday", "split": "Pull", "exercises": exercises['pull'][:2]},
                    {"day": "Friday", "split": "Legs + Core", "exercises": exercises['legs'][:2] + exercises['core'][:1]},
                ]
            }
        ]
    
    # Calculate target areas based on goals
    target_areas = []
    if "strength" in goals or not goals:
        target_areas.extend(["chest", "shoulders", "arms", "back", "legs"])
    if "weight_loss" in goals or "endurance" in goals:
        target_areas.extend(["abs", "core", "cardio"])
    
    plan = {
        "overview": {
            "duration": "4 weeks",
            "frequency": "3 days per week",
            "body_type": body_type,
            "focus": get_focus_based_on_profile(fitness_level, body_type),
            "target_areas": list(set(target_areas)),
            "primary_goal": primary_focus
        },
        "weeks": weekly_plan
    }
    
    return plan

def get_focus_based_on_profile(level, body_type):
    return f"{level} {body_type}".title()

def get_focus_area(goals, body_type):
    """
    Deprecated: kept for backward compatibility if needed, 
    but mainly replaced by direct plan generation
    """
    return "Comprehensive Gym Training"

def get_starting_recommendations(profile):
    """
    Get customized starting point recommendations based on body type
    """
    body_type = profile.get("body_type", "beginner")
    fitness_level = profile.get("fitness_level", "beginner")
    
    recommendations = {
        "skinny_fat": {
            "start_with": "Compound Movements (Hypertrophy Focus)",
            "priority": "Body Recomposition (Simultaneous Muscle Gain/Fat Loss)",
            "first_exercise": "Multi-joint Free Weight Movements",
            "frequency": "3-4 Days (Upper/Lower Split)",
            "nutrition": "High Protein (1.8-2.2g/kg at Maintenance Calories)",
            "avoid": "Excessive Steady-State Cardio (Interferes with adaptation)"
        },
        "lean_athletic": {
            "start_with": "Volume Cycle (Hypertrophy)",
            "priority": "Sarcoplasmic & Myofibrillar Hypertrophy",
            "first_exercise": "Compound Lifts (5-8 Rep Range)",
            "frequency": "4-5 Days (Push/Pull/Legs Split)",
            "nutrition": "Small Caloric Surplus (250-300kcal) + High Carbs",
            "avoid": "Overtraining (Respect MRV - Max Recoverable Volume)"
        },
        "bulky": {
            "start_with": "Metabolic Conditioning / Strength",
            "priority": "Lipolysis via Deficit & Heavy Lifting",
            "first_exercise": "Super-sets or Compound Complexes",
            "frequency": "3 Strength + 2 LISS/HIIT Cardio Sessions",
            "nutrition": "Caloric Deficit (-500kcal) with High Protein Retention",
            "avoid": "Empty liquid calories"
        },
        "lean_beginner": {
            "start_with": "Linear Progression Strength",
            "priority": "Neuromuscular Adaptation & Mass",
            "first_exercise": "Linear Periodization (Squat/Bench/Deadlift)",
            "frequency": "3 Days Full Body (Frequency Focus)",
            "nutrition": "Aggressive Surplus (+500kcal) + High Frequency Meals",
            "avoid": "Fasting windows (Need frequent anabolic signaling)"
        },
        "average": {
            "start_with": "Periodized Resistance Training",
            "priority": "General Physical Preparedness (GPP)",
            "first_exercise": "Fundamental Movement Patterns",
            "frequency": "3 Days/Week (Undulating Periodization)",
            "nutrition": "Balanced Macros (40/30/30)",
            "avoid": "Inconsistency in volume"
        },
        "beginner": {
            "start_with": "Motor Learning Phase",
            "priority": "Movement Competency & Connective Tissue Strength",
            "first_exercise": "Machine Isolation -> Free Weight Integration",
            "frequency": "3 Days (Full Body)",
            "nutrition": "Whole Foods & Protein Timing",
            "avoid": "Failure Training (Focus on RPE 6-7)"
        }
    }
    
    return recommendations.get(body_type, recommendations["beginner"])

from .workout_plans import EXERCISE_DATABASE
import random

def get_available_exercises(target_part):
    """Returns a list of all available exercises for a target part"""
    target_map = {
        'chest': ['push'], 'legs': ['legs'], 'shoulders': ['shoulders'], 
        'back': ['pull', 'back'], 'arms': ['push', 'pull'], 
        'upper': ['push', 'pull', 'shoulders', 'back'],
        'lower': ['legs', 'core'], 'full_body': ['push', 'pull', 'legs', 'core', 'shoulders', 'back'],
        'core': ['core']
    }
    selected_targets = target_map.get(target_part, ['push'])
    exercises = []
    seen = set()
    
    for cat in selected_targets:
        if cat in EXERCISE_DATABASE:
            for level in EXERCISE_DATABASE[cat]:
                for ex in EXERCISE_DATABASE[cat][level]:
                    if ex['name'] not in seen:
                        # Add metadata
                        ex_out = ex.copy()
                        ex_out['category'] = cat
                        exercises.append(ex_out)
                        seen.add(ex['name'])
    return exercises

def get_all_exercises():
    """Returns ALL exercises from the database with metadata"""
    all_exercises = []
    seen = set()
    
    for category in EXERCISE_DATABASE:
        for level in EXERCISE_DATABASE[category]:
            for ex in EXERCISE_DATABASE[category][level]:
                if ex['name'] not in seen:
                    ex_out = ex.copy()
                    ex_out['category'] = category
                    ex_out['difficulty'] = level  # Add difficulty level
                    all_exercises.append(ex_out)
                    seen.add(ex['name'])
    
    return all_exercises

def generate_instant_workout(time_mins, energy_level, target_part, fitness_level='beginner', include_exercises=None):
    """
    Generates a tailored workout session based on constraints.
    Supports including specific exercises.
    """
    if include_exercises is None:
        include_exercises = []
        
    # 1. Determine constraints
    if energy_level == 'high':
        time_per_set = 2.2 
        rest_time = "45-60s"
        intensity_modifier = "High Intensity"
    elif energy_level == 'medium':
        time_per_set = 2.5 
        rest_time = "60-90s"
        intensity_modifier = "Standard"
    else: # low
        time_per_set = 3.5 
        rest_time = "90-2 mins"
        intensity_modifier = "Light / Focus on Form"
        
    total_sets_capacity = int(time_mins / time_per_set)
    
    # 2. Select Exercises
    candidates = []
    
    target_map = {
        'chest': ['push'], 
        'legs': ['legs'], 
        'shoulders': ['shoulders'], 
        'back': ['back'],  # Changed from ['pull', 'back'] to only ['back'] to exclude arm exercises
        'arms': ['push', 'pull'],  # Arms can use both push and pull (triceps and biceps)
        'upper': ['push', 'back', 'shoulders'],  # Changed from ['push', 'pull', ...] to exclude isolated arm work
        'lower': ['legs', 'core'], 
        'full_body': ['push', 'pull', 'legs', 'core', 'shoulders', 'back'],
        'core': ['core'],
        'conditioning': ['push', 'pull', 'legs', 'core']  # Add conditioning option
    }
    
    # Handle both single string and list of targets
    targets_to_process = []
    if isinstance(target_part, list):
        targets_to_process = target_part
        display_title = " & ".join([t.title() for t in target_part])
    elif isinstance(target_part, str) and ',' in target_part:
        targets_to_process = [t.strip() for t in target_part.split(',')]
        display_title = " & ".join([t.title() for t in targets_to_process])
    else:
        targets_to_process = [target_part]
        display_title = target_part.replace('_', ' ').title()

    selected_targets = []
    for t in targets_to_process:
        # Normalize input to lowercase to match keys
        t_key = t.lower()
        selected_targets.extend(target_map.get(t_key, ['push', 'pull', 'legs', 'core']))
    
    # Deduplicate categories
    selected_targets = list(set(selected_targets))
    
    # Gather candidates (Priority vs Others)
    priority_candidates = []
    
    for target in selected_targets:
        if target in EXERCISE_DATABASE:
            # Use fitness level preference, but if looking for specific includes, check all levels?
            # For simplicity, check current level + beginner
            ex_list = EXERCISE_DATABASE[target].get(fitness_level, EXERCISE_DATABASE[target].get('beginner', []))
            
            # Also check other levels if we have specific includes that might be in other levels
            if include_exercises:
                 all_levels = []
                 for lvl in EXERCISE_DATABASE[target]:
                     all_levels.extend(EXERCISE_DATABASE[target][lvl])
                 ex_list = all_levels

            for ex in ex_list:
                ex_copy = ex.copy()
                ex_copy['category'] = target
                
                if ex['name'] in include_exercises:
                    # Avoid duplicates in priority
                    if not any(p['name'] == ex['name'] for p in priority_candidates):
                        priority_candidates.append(ex_copy)
                else:
                    candidates.append(ex_copy)

    # 3. Build Plan
    plan = []
    current_sets = 0
    
    # Add Priority Exercises
    for ex in priority_candidates:
        if current_sets >= total_sets_capacity: 
             break # Capacity reached (simplified)
        plan.append(ex)
        current_sets += ex.get('sets', 3)
        
    # Fill remaining capacity with random candidates
    used_categories = set()
    while current_sets < total_sets_capacity and candidates:
        selected_ex = None
        # Shuffle candidates to ensure mixing of different muscle groups
        random.shuffle(candidates)
        
        for ex in candidates:
            if any(p['name'] == ex['name'] for p in plan): continue
            
            # Diversity check (try to rotate categories)
            if ex['category'] not in used_categories or len(used_categories) >= len(selected_targets):
                selected_ex = ex
                break
        
        if not selected_ex:
             if len(used_categories) >= len(selected_targets):
                 used_categories = set()
                 continue
             else:
                 break 
            
        sets_for_this = 3 if total_sets_capacity - current_sets >= 3 else (total_sets_capacity - current_sets)
        if sets_for_this < 1: break
        
        final_ex = selected_ex.copy()
        final_ex['sets'] = sets_for_this
        final_ex['rest'] = rest_time
        final_ex['reps'] = "8-12"
        if energy_level == 'low': final_ex['reps'] = "10-12 (Easy)"
        elif energy_level == 'high': final_ex['reps'] = "8-10 (Heavy)"
            
        plan.append(final_ex)
        current_sets += sets_for_this
        used_categories.add(selected_ex['category'])
        candidates.remove(selected_ex) # Done
        
    return {
        "title": f"{time_mins} Min {intensity_modifier} {display_title}",
        "duration": f"{time_mins} Minutes",
        "intensity": energy_level.title(),
        "focus": display_title,
        "exercises": plan,
        "total_sets": current_sets,
        "calories_est": int(time_mins * (8 if energy_level == 'high' else 5))
    }

def get_replacement_exercise(current_ex_name, target_part, fitness_level='beginner', exclude_names=None):
    """
    Finds a replacement exercise for the same target part.
    """
    if exclude_names is None:
        exclude_names = []
        
    target_map = {
        'chest': ['push'], 'legs': ['legs'], 'shoulders': ['shoulders'], 
        'back': ['pull', 'back'], 'arms': ['push', 'pull'], 
        'upper': ['push', 'pull', 'shoulders', 'back'],
        'lower': ['legs', 'core'], 'full_body': ['push', 'pull', 'legs', 'core', 'shoulders', 'back'],
        'core': ['core']
    }
    
    selected_targets = target_map.get(target_part, ['push'])
    candidates = []
    
    for category in selected_targets:
        if category in EXERCISE_DATABASE:
            levels = ['beginner']
            if fitness_level in ['intermediate', 'advanced']: levels.append('intermediate')
            if fitness_level == 'advanced': levels.append('advanced')
            
            for level in levels:
                ex_list = EXERCISE_DATABASE[category].get(level, [])
                for ex in ex_list:
                    if ex['name'] != current_ex_name and ex['name'] not in exclude_names:
                        ex_copy = ex.copy()
                        ex_copy['category'] = category
                        ex_copy['score'] = random.random()
                        candidates.append(ex_copy)
    
    if candidates:
        return random.choice(candidates)
    return None

NON_STRENGTH_DATABASE = {
    "HIIT": [
        {"name": "Burpees", "duration": "45s", "rest": "15s", "guide": "Jump up, drop directly to chest-to-floor, push up, jump in, jump up."},
        {"name": "Jumping Jacks", "duration": "45s", "rest": "15s", "guide": "Standard jumping jacks, maintain steady pace."},
        {"name": "Mountain Climbers", "duration": "45s", "rest": "15s", "guide": "Plank position, alternate knees to chest rapidly."},
        {"name": "High Knees", "duration": "45s", "rest": "15s", "guide": "Run in place, lifting knees high to waist level."},
        {"name": "Jump Squats", "duration": "45s", "rest": "15s", "guide": "Squat down and explode upwards into a jump."},
        {"name": "Plank Jacks", "duration": "45s", "rest": "15s", "guide": "Plank position, jump feet out and in like a jack."},
        {"name": "Skaters", "duration": "45s", "rest": "15s", "guide": "Jump side to side, landing on one foot, swinging arms."},
        {"name": "Push-ups", "duration": "45s", "rest": "15s", "guide": "Standard push-ups or on knees. Keep core tight."},
        {"name": "Bicycle Crunches", "duration": "45s", "rest": "15s", "guide": "Elbow to opposite knee, extending other leg."},
        {"name": "Lunge Jumps", "duration": "45s", "rest": "15s", "guide": "Switch legs in air, landing in a lunge."},
        {"name": "Tricep Dips", "duration": "45s", "rest": "15s", "guide": "Use a chair or floor. Dip down and push up."},
        {"name": "V-Ups", "duration": "45s", "rest": "15s", "guide": "Lift legs and torso to touch toes."},
        {"name": "Commando Planks", "duration": "45s", "rest": "15s", "guide": "Elbow plank to high plank and back down."},
        {"name": "Squat Thrusts", "duration": "45s", "rest": "15s", "guide": "Like a burpee without the push-up and jump."},
        {"name": "Side Plank", "duration": "30s each", "rest": "15s", "guide": "Hold side plank, switch halfway."},
        {"name": "Flutter Kicks", "duration": "45s", "rest": "15s", "guide": "Lie on back, kick legs up and down."},
        {"name": "Box Jumps (or Step Ups)", "duration": "45s", "rest": "15s", "guide": "Jump onto sturdy surface or step up rapidly."}
    ],
    "Cardio": [
        {"name": "Jumping Jacks", "duration": "2 min", "rest": "30s", "guide": "Steady pace jumping jacks."},
        {"name": "High Knees", "duration": "1 min", "rest": "30s", "guide": "March or run with high knees."},
        {"name": "Butt Kicks", "duration": "1 min", "rest": "30s", "guide": "Jog in place kicking heels to glutes."},
        {"name": "Shadow Boxing", "duration": "2 min", "rest": "30s", "guide": "Bounce on toes, throw punches."},
        {"name": "Step Ups", "duration": "2 min", "rest": "30s", "guide": "Step up and down on a sturdy chair or stair."},
        {"name": "Running in Place", "duration": "3 min", "rest": "30s", "guide": "Jog in place, focusing on breathing."},
        {"name": "Inchworms", "duration": "1 min", "rest": "30s", "guide": "Walk hands out to plank, walk feet to hands."},
        {"name": "Side Shuffles", "duration": "1 min", "rest": "30s", "guide": "Shuffle quickly side to side."},
        {"name": "Rope Skips (Invisible)", "duration": "2 min", "rest": "30s", "guide": "Mimic jumping rope movement."},
        {"name": "Squat Pulses", "duration": "1 min", "rest": "30s", "guide": "Hold squat and pulse up and down slightly."},
        {"name": "Arm Circles", "duration": "1 min", "rest": "10s", "guide": "Large circles forward and backward while marching."},
        {"name": "Torso Twists", "duration": "1 min", "rest": "10s", "guide": "Twist torso side to side, engaging core."},
        {"name": "Front Kicks", "duration": "1 min", "rest": "30s", "guide": "Kick legs forward alternately."},
        {"name": "Power Walking", "duration": "5 min", "rest": "1 min", "guide": "Walk briskly around the room/house."}
    ],
    "Yoga": [
        {"name": "Child's Pose", "duration": "1 min", "rest": "10s", "guide": "Kneel, sit on heels, fold forward, arms extended."},
        {"name": "Cat-Cow Stretch", "duration": "1 min", "rest": "10s", "guide": "Hands and knees, arch and round spine."},
        {"name": "Downward Facing Dog", "duration": "1 min", "rest": "10s", "guide": "Hips high, heels towards floor, push through hands."},
        {"name": "Warrior I", "duration": "45s each", "rest": "10s", "guide": "Lunge forward, back heel down, arms up."},
        {"name": "Warrior II", "duration": "45s each", "rest": "10s", "guide": "Lunge, arms out to sides, gaze over front hand."},
        {"name": "Triangle Pose", "duration": "45s each", "rest": "10s", "guide": "Straight legs, reach hand to shin/floor, other arm up."},
        {"name": "Tree Pose", "duration": "45s each", "rest": "10s", "guide": "Stand on one leg, other foot on thigh/calf. Balance."},
        {"name": "Cobra Pose", "duration": "30s", "rest": "10s", "guide": "Lie on stomach, lift chest gently using back muscles."},
        {"name": "Bridge Pose", "duration": "45s", "rest": "15s", "guide": "Lie on back, lift hips, interlace hands under."},
        {"name": "Seated Forward Fold", "duration": "1 min", "rest": "10s", "guide": "Sit with legs straight, reach for feet."},
        {"name": "Butterfly Pose", "duration": "1 min", "rest": "10s", "guide": "Soles of feet together, knees wide, fold forward."},
        {"name": "Pigeon Pose", "duration": "1 min each", "rest": "10s", "guide": "One leg forward bent, other extended back. Hip opener."},
        {"name": "Sphinx Pose", "duration": "1 min", "rest": "10s", "guide": "Lie on stomach, prop up on forearms."},
        {"name": "Happy Baby", "duration": "1 min", "rest": "10s", "guide": "Lie on back, hold outer feet, knees wide."},
        {"name": "Corpse Pose (Savasana)", "duration": "3 min", "rest": "0s", "guide": "Lie flat, relax completely. Breathe."}
    ]
}

# ==============================================================================
# SCIENTIFIC ALGORITHM: Workout Periodization (NSCA Guidelines)
# Reference: Kraemer, W. J., & Ratamess, N. A. (2004). 
# "Fundamentals of resistance training: progression and exercise prescription"
# ==============================================================================
def get_progression_phase(weeks_training=1):
    """
    Determines the Phase of Linear Periodization.
    Phase 1: Hypertrophy/Endurance (High Vol, Low Int)
    Phase 2: Basic Strength (Mod Vol, Mod/High Int)
    Phase 3: Power/Peaking (Low Vol, High Int)
    """
    # Simple linear cycle simulation
    cycle_position = (weeks_training - 1) % 12 # 12 week macrocycle
    
    if cycle_position < 4:
        # Weeks 1-4: Hypertrophy/Endurance
        return {
            "phase": "Hypertrophy",
            "reps": "8-12",
            "sets": 3,
            "rest": "60-90s", # ATP-PCr partial recovery
            "intensity_factor": 0.67 # %1RM
        }
    elif cycle_position < 8:
        # Weeks 5-8: Basic Strength
        return {
            "phase": "Strength",
            "reps": "6-8",
            "sets": 4,
            "rest": "2-3 min", # ATP-PCr near full recovery
            "intensity_factor": 0.85 
        }
    else:
        # Weeks 9-12: Power
        return {
            "phase": "Power",
            "reps": "3-5",
            "sets": 5,
            "rest": "3-5 min", # Neural recovery
            "intensity_factor": 0.93
        }

def calculate_calories(weight_kg, workout_type, duration_hours, intensity="medium"):
    # METs based on Compendium of Physical Activities
    mets = {
        "Strength": 5.0, # General weight lifting
        "HIIT": 8.0, 
        "Cardio": 7.0,
        "Yoga": 3.0
    }
    base_met = mets.get(workout_type, 4.0)
    
    # Adjust MET based on intensity (Scientific nuance)
    if intensity == "high": base_met *= 1.1
    elif intensity == "low": base_met *= 0.9
        
    return int(base_met * weight_kg * duration_hours)

def generate_daily_plan(profile, workout_type, duration_mins=30, intensity="medium", focus_area="random"):
    plan = []
    
    if workout_type == 'Strength':
        targets = []
        if focus_area and focus_area != 'random':
            # Handle multi-select (e.g., "Chest & Back" or "chest_back")
            raw_targets = focus_area.replace('&', ' ').replace('_', ' ').split()
            # Clean and map targets
            valid_targets = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'upper', 'lower', 'full_body']
            for t in raw_targets:
                t = t.lower()
                if t in valid_targets:
                    targets.append(t)
        
        if not targets:
            targets = [random.choice(['full_body', 'upper', 'lower'])]
            
        # If multiple targets, we need to balance them
        # Logic: Get candidates for ALL targets, then distribute
        # ... (Merging logic handled in generate_instant_workout enhanced or here?)
        
        # Simplest approach: Pass primary target to get basic structure, 
        # but we need a verified way to get exercises for multiple.
        # Let's modify generate_instant_workout to accept a list of targets?
        # Or better: just pick one as "primary" for the metadata, but merge exercise pools?
        
        # Actually, let's create a custom merged pool here
        all_candidates = []
        for t in targets:
             all_candidates.extend(get_available_exercises(t))
             
        # Remove duplicates
        unique_candidates = {ex['name']: ex for ex in all_candidates}.values()
        unique_candidates = list(unique_candidates)
        
        # Now we need to select from this mixed pool
        # We can reuse the selection logic from generate_instant_workout if we extract it
        # OR just call generate_instant_workout for the first target and then Inject/Replace exercises?
        # No, better to refactor generate_instant_workout's candidate gathering.
        
        # Quick Fix: Let's pass the list of targets to generate_instant_workout if we modify it
        # But to avoid breaking too much, let's just pick one target for the header
        # and pass the "include_exercises" or "custom_pool"?
        
        # Let's Modify generate_instant_workout to accept 'target_part' as a list or string
        # I'll update generate_instant_workout first.
        
        full_result = generate_instant_workout(
            duration_mins, 
            intensity, 
            targets, # Passing list now
            profile.get('fitness_level', 'beginner')
        )
        
        # Apply NSCA Periodization Logic
        # For demo: assume user is in Week 2 (Hypertrophy Phase)
        # In a real thesis app, this would query a 'training_cycle' table
        periodization = get_progression_phase(weeks_training=2)
        
        # Apply Scientific Overrides to the result
        if isinstance(full_result, dict):
            raw_exercises = full_result.get('exercises', [])
            
            # Apply Scientific Overrides
            for ex in raw_exercises:
                # Override reps/sets based on Periodization Phase
                ex['reps'] = f"{periodization['reps']} (NSCA {periodization['phase']})"
                ex['rest'] = periodization['rest']
                ex['sets'] = periodization['sets']
                ex['meta'] = {
                    "method": "Linear Periodization",
                    "phase": periodization['phase'],
                    "ref": "Kraemer et al. (2004)"
                }
            plan = raw_exercises
        else:
            plan = full_result
            
    else:
        # Standard logic for non-resistance training
        candidates = NON_STRENGTH_DATABASE.get(workout_type, [])
        if not candidates: candidates = NON_STRENGTH_DATABASE.get("Cardio", [])
            
        avg_duration = 1.5
        if workout_type == "HIIT": avg_duration = 1.0
        elif workout_type == "Cardio": avg_duration = 2.5
        
        target_count = int(duration_mins / avg_duration)
        target_count = max(5, target_count)
        
        available = candidates.copy()
        if workout_type == "Yoga":
            # Ensure Savasana at end (Yoga tradition)
            savasana = next((x for x in available if "Savasana" in x['name']), None)
            if savasana: available.remove(savasana)
            random.shuffle(available)
            while len(plan) < target_count - 1 and available:
                plan.append(available.pop().copy())
            if savasana: plan.append(savasana)
        else:
            random.shuffle(available)
            while len(plan) < target_count and available:
                plan.append(available.pop().copy())

    # Calorie Calculation (Mifflin-St Jeor derived METs logic)
    weight = float(profile.get('weight', 70) or 70) # Handle potential string/int issues
    duration_hours = duration_mins / 60.0
    calories = calculate_calories(weight, workout_type, duration_hours, intensity)
    
    summary = f"{workout_type} Session"
    if intensity: summary += f" ({intensity.title()})"
    
    
    return {
        "exercises": plan,  # Changed from "plan" to "exercises"
        "calories_est": calories,  # Changed from "calories" to "calories_est"
        "title": summary,  # Changed from "summary" to "title"
        "intensity": intensity,
        "type": workout_type,
        "duration": f"{duration_mins} Minutes",  # Match frontend format
        "scientific_basis": {
            "periodization_model": "Linear (NSCA Guidelines)",
            "citation": "Kraemer & Ratamess (2004)",
            "metabolic_eq": "Compendium of Physical Activities (2011)"
        }
    }

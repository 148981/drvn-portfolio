"""
進階標籤訓練計劃生成器
基於運動科學原理，為使用者生成真正有效的訓練計劃
"""

# ==================== 標籤到肌肉群映射 ====================
HASHTAG_MUSCLE_MAPPING = {
    # 痛點標籤 - Pain Points
    "#胸肌無力": {
        "primary": ["chest"],
        "secondary": ["front_delts", "triceps"],
        "type": "corrective",
        "focus": "推力建立"
    },
    "#駝背改善": {
        "primary": ["upper_back", "mid_traps", "rear_delts"],
        "secondary": ["rhomboids", "lower_traps"],
        "type": "corrective",
        "focus": "姿勢矯正"
    },
    "#深蹲卡關": {
        "primary": ["quads", "glutes"],
        "secondary": ["hamstrings", "core"],
        "type": "corrective",
        "focus": "動作模式"
    },
    "#肩膀痠痛": {
        "primary": ["rotator_cuff", "rear_delts"],
        "secondary": ["mid_traps", "serratus"],
        "type": "corrective",
        "focus": "肩關節穩定"
    },
    "#手臂太細": {
        "primary": ["biceps", "triceps"],
        "secondary": ["forearms", "brachialis"],
        "type": "hypertrophy",
        "focus": "肌肉量"
    },
    "#核心無力": {
        "primary": ["abs", "obliques"],
        "secondary": ["deep_core", "lower_back"],
        "type": "corrective",
        "focus": "軀幹穩定"
    },
    "#腰痛困擾": {
        "primary": ["core", "glutes"],
        "secondary": ["lower_back", "hip_flexors"],
        "type": "corrective",
        "focus": "脊椎穩定"
    },
    "#體態不佳": {
        "primary": ["chest", "back", "core"],
        "secondary": ["glutes", "shoulders"],
        "type": "corrective",
        "focus": "全身平衡"
    },
    "#久坐族": {
        "primary": ["glutes", "hamstrings", "upper_back"],
        "secondary": ["hip_flexors", "core"],
        "type": "corrective",
        "focus": "活動度+穩定"
    },
    "#運動受傷復健": {
        "primary": [],  # 需根據受傷部位動態設定
        "secondary": [],
        "type": "rehab",
        "focus": "組織修復"
    },
    
    # 目標標籤 - Goals
    "#增肌": {
        "primary": ["chest", "back", "legs"],
        "secondary": ["shoulders", "arms"],
        "type": "hypertrophy",
        "focus": "肌肥大"
    },
    "#減脂": {
        "primary": ["legs", "back", "chest"],
        "secondary": ["core", "cardio"],
        "type": "metabolic",
        "focus": "代謝訓練"
    },
    "#體能提升": {
        "primary": ["legs", "core"],
        "secondary": ["cardio", "power"],
        "type": "conditioning",
        "focus": "功能性"
    },
    "#力量突破": {
        "primary": ["legs", "chest", "back"],
        "secondary": ["core"],
        "type": "strength",
        "focus": "最大肌力"
    },
    "#Marathon訓練": {
        "primary": ["legs", "core"],
        "secondary": ["hip_stability", "ankle"],
        "type": "endurance",
        "focus": "肌耐力"
    },
    "#健美比賽": {
        "primary": ["chest", "back", "legs", "shoulders", "arms"],
        "secondary": ["calves", "forearms"],
        "type": "hypertrophy",
        "focus": "極大化肌肉"
    },
    "#功能性訓練": {
        "primary": ["core", "legs"],
        "secondary": ["full_body", "multi_planar"],
        "type": "functional",
        "focus": "生活動作"
    },
    
    # English Mappings (From Onboarding Matrix)
    "#BackPain": { "primary": ["core", "lower_back"], "secondary": ["glutes"], "type": "corrective", "focus": "Pain Relief" },
    "#KneePain": { "primary": ["quads", "glutes"], "secondary": ["hamstrings", "calves"], "type": "corrective", "focus": "Joint Stability" },
    "#Posture": { "primary": ["upper_back", "rear_delts"], "secondary": ["core"], "type": "corrective", "focus": "Posture Fix" },
    "#Flexibility": { "primary": ["full_body"], "secondary": ["mobility"], "type": "corrective", "focus": "Range of Motion" },
    "#Mobility": { "primary": ["hips", "shoulders"], "secondary": ["spine"], "type": "corrective", "focus": "Movement Flow" },
    
    "#LoseWeight": { "primary": ["legs", "back"], "secondary": ["cardio"], "type": "metabolic", "focus": "Fat Burn" },
    "#SixPackAbs": { "primary": ["abs", "obliques"], "secondary": ["core"], "type": "hypertrophy", "focus": "Definition" },
    "#BigArms": { "primary": ["biceps", "triceps"], "secondary": ["forearms"], "type": "hypertrophy", "focus": "Arm Size" },
    "#ChestGains": { "primary": ["chest"], "secondary": ["triceps", "shoulders"], "type": "hypertrophy", "focus": "Chest Mass" },
    "#Shoulders": { "primary": ["shoulders"], "secondary": ["traps"], "type": "hypertrophy", "focus": "3D Delts" },
    "#Glutes": { "primary": ["glutes"], "secondary": ["hamstrings"], "type": "hypertrophy", "focus": "Booty Build" },
    "#Legs": { "primary": ["quads", "hamstrings"], "secondary": ["glutes", "calves"], "type": "hypertrophy", "focus": "Leg Size" },
    
    "#GetStrong": { "primary": ["legs", "back", "chest"], "secondary": ["core"], "type": "strength", "focus": "Raw Strength" },
    "#BuildMuscle": { "primary": ["chest", "back", "legs"], "secondary": ["shoulders", "arms"], "type": "hypertrophy", "focus": "Mass Gain" },
    "#PullUps": { "primary": ["back", "biceps"], "secondary": ["core"], "type": "strength", "focus": "Vertical Pull" },
    "#SquatPR": { "primary": ["legs", "core"], "secondary": ["lower_back"], "type": "strength", "focus": "Squat Max" },
    "#BenchPR": { "primary": ["chest", "triceps"], "secondary": ["front_delts"], "type": "strength", "focus": "Bench Max" },
    "#Deadlift": { "primary": ["back", "legs"], "secondary": ["grip"], "type": "strength", "focus": "Deadlift Max" }
}


# ==================== 完整動作資料庫 ====================
EXERCISE_DATABASE = {
    # ========== 胸部訓練 ==========
    "chest": {
        "beginner": [
            {
                "name": "跪姿伏地挺身",
                "sets": 3, "reps": "12-15",
                "type": "compound",
                "equipment": "bodyweight",
                "attributes": ["corrective", "form_building"],
                "progression_from": None
            },
            {
                "name": "彈力帶胸推",
                "sets": 3, "reps": "15-20",
                "type": "compound",
                "equipment": "bands",
                "attributes": ["mind_muscle", "stability"],
                "progression_from": None
            },
            {
                "name": "啞鈴臥推 (輕重量)",
                "sets": 3, "reps": "10-12",
                "type": "compound",
                "equipment": "dumbbells",
                "attributes": ["control", "basic_strength"],
                "progression_from": "彈力帶胸推"
            },
            {
                "name": "上斜伏地挺身",
                "sets": 3, "reps": "10-15",
                "type": "compound",
                "equipment": "bodyweight",
                "attributes": ["upper_chest", "bodyweight"],
                "progression_from": "跪姿伏地挺身"
            }
        ],
        "intermediate": [
            {
                "name": "標準伏地挺身",
                "sets": 4, "reps": "10-15",
                "type": "compound",
                "attributes": ["core_integration", "functional"],
                "progression_from": "跪姿伏地挺身"
            },
            {
                "name": "啞鈴臥推",
                "sets": 4, "reps": "8-12",
                "type": "compound",
                "attributes": ["hypertrophy", "stability"],
                "progression_from": "啞鈴臥推 (輕重量)"
            },
            {
                "name": "上斜啞鈴臥推",
                "sets": 3, "reps": "10-12",
                "type": "compound",
                "attributes": ["upper_chest", "hypertrophy"],
                "progression_from": "上斜伏地挺身"
            },
            {
                "name": "飛鳥",
                "sets": 3, "reps": "12-15",
                "type": "isolation",
                "attributes": ["stretch", "mind_muscle"],
                "progression_from": None
            },
            {
                "name": "Cable Crossover",
                "sets": 3, "reps": "12-15",
                "type": "isolation",
                "attributes": ["constant_tension", "sculpting"],
                "progression_from": "飛鳥"
            }
        ],
        "advanced": [
            {
                "name": "槓鈴臥推",
                "sets": 5, "reps": "6-8",
                "type": "compound",
                "attributes": ["strength", "power"],
                "progression_from": "啞鈴臥推"
            },
            {
                "name": "上斜槓鈴臥推",
                "sets": 4, "reps": "6-8",
                "type": "compound",
                "attributes": ["upper_chest", "strength"],
                "progression_from": "上斜啞鈴臥推"
            },
            {
                "name": "雙槓撐體",
                "sets": 4, "reps": "8-12",
                "type": "compound",
                "attributes": ["lower_chest", "triceps"],
                "progression_from": "標準伏地挺身"
            },
            {
                "name": "爆發力伏地挺身",
                "sets": 4, "reps": "6-8",
                "type": "power",
                "attributes": ["explosiveness", "athletic"],
                "progression_from": "標準伏地挺身"
            }
        ]
    },
    
    # ========== 背部訓練 ==========
    "back": {
        "beginner": [
            {
                "name": "彈力帶划船",
                "sets": 3, "reps": "15-20",
                "type": "compound",
                "attributes": ["corrective", "scapular"],
                "progression_from": None
            },
            {
                "name": "啞鈴划船",
                "sets": 3, "reps": "10-12",
                "type": "compound",
                "attributes": ["basic_strength", "control"],
                "progression_from": "彈力帶划船"
            },
            {
                "name": "坐姿划船",
                "sets": 3, "reps": "10-12",
                "type": "compound",
                "attributes": ["stability", "mid_back"],
                "progression_from": None
            },
            {
                "name": "輔助引體向上",
                "sets": 3, "reps": "6-8",
                "type": "compound",
                "attributes": ["vertical_pull", "lat_width"],
                "progression_from": None
            }
        ],
        "intermediate": [
            {
                "name": "單臂啞鈴划船",
                "sets": 4, "reps": "10-12",
                "type": "compound",
                "attributes": ["unilateral", "core_rotation"],
                "progression_from": "啞鈴划船"
            },
            {
                "name": "槓鈴划船",
                "sets": 4, "reps": "8-10",
                "type": "compound",
                "attributes": ["mass", "posterior_chain"],
                "progression_from": "啞鈴划船"
            },
            {
                "name": "引體向上",
                "sets": 4, "reps": "8-10",
                "type": "compound",
                "attributes": ["vertical_pull", "strength"],
                "progression_from": "輔助引體向上"
            },
            {
                "name": "TRX划船",
                "sets": 3, "reps": "12-15",
                "type": "compound",
                "attributes": ["instability", "functional"],
                "progression_from": "坐姿划船"
            },
            {
                "name": "滑輪下拉",
                "sets": 3, "reps": "10-12",
                "type": "compound",
                "attributes": ["lat_focus", "hypertrophy"],
                "progression_from": "輔助引體向上"
            }
        ],
        "advanced": [
            {
                "name": "硬舉",
                "sets": 5, "reps": "5-6",
                "type": "compound",
                "attributes": ["strength", "full_posterior"],
                "progression_from": "槓鈴划船"
            },
            {
                "name": "負重引體向上",
                "sets": 5, "reps": "6-8",
                "type": "compound",
                "attributes": ["strength", "advanced"],
                "progression_from": "引體向上"
            },
            {
                "name": "T-Bar Row",
                "sets": 4, "reps": "8-10",
                "type": "compound",
                "attributes": ["thickness", "mass"],
                "progression_from": "槓鈴划船"
            },
            {
                "name": "Pendlay Row",
                "sets": 4, "reps": "6-8",
                "type": "compound",
                "attributes": ["explosive", "power"],
                "progression_from": "槓鈴划船"
            }
        ]
    },
    
    # ========== 腿部訓練 ==========
    "legs": {
        "beginner": [
            {
                "name": "徒手深蹲",
                "sets": 3, "reps": "15-20",
                "type": "compound",
                "attributes": ["form_building", "mobility"],
                "progression_from": None
            },
            {
                "name": "高腳杯深蹲",
                "sets": 3, "reps": "12-15",
                "type": "compound",
                "attributes": ["posture", "quad_focus"],
                "progression_from": "徒手深蹲"
            },
            {
                "name": "分腿蹲",
                "sets": 3, "reps": "10-12",
                "type": "compound",
                "attributes": ["unilateral", "balance"],
                "progression_from": None
            },
            {
                "name": "腿推",
                "sets": 3, "reps": "12-15",
                "type": "compound",
                "attributes": ["quad_mass", "safety"],
                "progression_from": "徒手深蹲"
            }
        ],
        "intermediate": [
            {
                "name": "槓鈴深蹲",
                "sets": 4, "reps": "8-12",
                "type": "compound",
                "attributes": ["mass", "strength"],
                "progression_from": "高腳杯深蹲"
            },
            {
                "name": "保加利亞分腿蹲",
                "sets": 4, "reps": "8-10",
                "type": "compound",
                "attributes": ["unilateral", "glute_focus"],
                "progression_from": "分腿蹲"
            },
            {
                "name": "羅馬尼亞硬舉",
                "sets": 3, "reps": "10-12",
                "type": "compound",
                "attributes": ["hamstring", "hip_hinge"],
                "progression_from": None
            },
            {
                "name": "腿彎舉",
                "sets": 3, "reps": "12-15",
                "type": "isolation",
                "attributes": ["hamstring_isolation", "injury_prevention"],
                "progression_from": None
            },
            {
                "name": "腿伸展",
                "sets": 3, "reps": "12-15",
                "type": "isolation",
                "attributes": ["quad_isolation", "pre_exhaust"],
                "progression_from": None
            }
        ],
        "advanced": [
            {
                "name": "槓鈴深蹲 (大重量)",
                "sets": 5, "reps": "5-6",
                "type": "compound",
                "attributes": ["max_strength", "powerlifting"],
                "progression_from": "槓鈴深蹲"
            },
            {
                "name": "前蹲舉",
                "sets": 4, "reps": "6-8",
                "type": "compound",
                "attributes": ["quad_dominant", "olympic"],
                "progression_from": "槓鈴深蹲"
            },
            {
                "name": "單腿硬舉",
                "sets": 4, "reps": "8-10",
                "type": "compound",
                "attributes": ["unilateral", "stability"],
                "progression_from": "羅馬尼亞硬舉"
            },
            {
                "name": "Hip Thrust (大重量)",
                "sets": 4, "reps": "8-10",
                "type": "compound",
                "attributes": ["glute_max", "power"],
                "progression_from": "臀橋"
            }
        ]
    },
    
    # ========== 肩部訓練 ==========
    "shoulders": {
        "beginner": [
            {
                "name": "啞鈴肩推 (輕重量)",
                "sets": 3, "reps": "10-12",
                "type": "compound",
                "attributes": ["basic", "control"],
                "progression_from": None
            },
            {
                "name": "側平舉 (輕重量)",
                "sets": 3, "reps": "12-15",
                "type": "isolation",
                "attributes": ["lateral_delt", "mind_muscle"],
                "progression_from": None
            },
            {
                "name": "前平舉",
                "sets": 3, "reps": "12-15",
                "type": "isolation",
                "attributes": ["front_delt", "posture"],
                "progression_from": None
            },
            {
                "name": "彈力帶Face Pull",
                "sets": 3, "reps": "15-20",
                "type": "isolation",
                "attributes": ["rear_delt", "corrective"],
                "progression_from": None
            }
        ],
        "intermediate": [
            {
                "name": "槓鈴肩推",
                "sets": 4, "reps": "8-10",
                "type": "compound",
                "attributes": ["mass", "strength"],
                "progression_from": "啞鈴肩推 (輕重量)"
            },
            {
                "name": "阿諾推舉",
                "sets": 3, "reps": "10-12",
                "type": "compound",
                "attributes": ["rotation", "full_delt"],
                "progression_from": "啞鈴肩推 (輕重量)"
            },
            {
                "name": "Cable Side Raise",
                "sets": 3, "reps": "12-15",
                "type": "isolation",
                "attributes": ["continuous_tension", "lateral_delt"],
                "progression_from": "側平舉 (輕重量)"
            },
            {
                "name": "Face Pull",
                "sets": 4, "reps": "12-15",
                "type": "isolation",
                "attributes": ["rear_delt", "rotator_cuff"],
                "progression_from": "彈力帶Face Pull"
            }
        ],
        "advanced": [
            {
                "name": "槓鈴肩推 (大重量)",
                "sets": 5, "reps": "5-6",
                "type": "compound",
                "attributes": ["max_strength", "power"],
                "progression_from": "槓鈴肩推"
            },
            {
                "name": "手倒立伏地挺身",
                "sets": 4, "reps": "6-8",
                "type": "compound",
                "attributes": ["advanced", "bodyweight"],
                "progression_from": "槓鈴肩推"
            },
            {
                "name": "Overhead Press (競技)",
                "sets": 5, "reps": "3-5",
                "type": "compound",
                "attributes": ["powerlifting", "max_strength"],
                "progression_from": "槓鈴肩推 (大重量)"
            }
        ]
    },
    
    # ========== 手臂訓練 ==========
    "arms_biceps": {
        "beginner": [
            {
                "name": "啞鈴二頭彎舉",
                "sets": 3, "reps": "10-12",
                "type": "isolation",
                "attributes": ["basic", "mass"],
                "progression_from": None
            },
            {
                "name": "錘式彎舉",
                "sets": 3, "reps": "10-12",
                "type": "isolation",
                "attributes": ["brachialis", "forearm"],
                "progression_from": None
            },
            {
                "name": "Cable彎舉",
                "sets": 3, "reps": "12-15",
                "type": "isolation",
                "attributes": ["continuous_tension", "pump"],
                "progression_from": "啞鈴二頭彎舉"
            }
        ],
        "intermediate": [
            {
                "name": "槓鈴彎舉",
                "sets": 4, "reps": "8-12",
                "type": "isolation",
                "attributes": ["mass", "strength"],
                "progression_from": "啞鈴二頭彎舉"
            },
            {
                "name": "集中彎舉",
                "sets": 3, "reps": "10-12",
                "type": "isolation",
                "attributes": ["peak", "isolation"],
                "progression_from": "啞鈴二頭彎舉"
            },
            {
                "name": "Preacher Curl",
                "sets": 3, "reps": "10-12",
                "type": "isolation",
                "attributes": ["lower_bicep", "strict_form"],
                "progression_from": "槓鈴彎舉"
            }
        ],
        "advanced": [
            {
                "name": "Weighted Chin-ups",
                "sets": 4, "reps": "6-8",
                "type": "compound",
                "attributes": ["strength", "functional"],
                "progression_from": "槓鈴彎舉"
            },
            {
                "name": "21s彎舉",
                "sets": 3, "reps": "21",
                "type": "isolation",
                "attributes": ["intensity_technique", "pump"],
                "progression_from": "槓鈴彎舉"
            }
        ]
    },
    
    "arms_triceps": {
        "beginner": [
            {
                "name": "三頭下壓",
                "sets": 3, "reps": "10-12",
                "type": "isolation",
                "attributes": ["basic", "cable"],
                "progression_from": None
            },
            {
                "name": "過頭啞鈴伸展",
                "sets": 3, "reps": "10-12",
                "type": "isolation",
                "attributes": ["long_head", "stretch"],
                "progression_from": None
            }
        ],
        "intermediate": [
            {
                "name": "窄握臥推",
                "sets": 4, "reps": "8-10",
                "type": "compound",
                "attributes": ["mass", "strength"],
                "progression_from": "三頭下壓"
            },
            {
                "name": "Skull Crusher",
                "sets": 3, "reps": "10-12",
                "type": "isolation",
                "attributes": ["mass", "stretch"],
                "progression_from": "三頭下壓"
            },
            {
                "name": "Diamond Push-ups",
                "sets": 3, "reps": "12-15",
                "type": "compound",
                "attributes": ["bodyweight", "functional"],
                "progression_from": None
            }
        ],
        "advanced": [
            {
                "name": "Close-grip Bench (大重量)",
                "sets": 5, "reps": "6-8",
                "type": "compound",
                "attributes": ["strength", "mass"],
                "progression_from": "窄握臥推"
            },
            {
                "name": "Weighted Dips",
                "sets": 4, "reps": "8-10",
                "type": "compound",
                "attributes": ["mass", "strength"],
                "progression_from": "Diamond Push-ups"
            }
        ]
    },
    
    # ========== 核心訓練 ==========
    "core": {
        "beginner": [
            {
                "name": "平板支撐",
                "sets": 3, "reps": "30-45秒",
                "type": "isometric",
                "attributes": ["anti_extension", "basic"],
                "progression_from": None
            },
            {
                "name": "Dead Bug",
                "sets": 3, "reps": "10/側",
                "type": "dynamic",
                "attributes": ["anti_extension", "coordination"],
                "progression_from": None
            },
            {
                "name": "Bird Dog",
                "sets": 3, "reps": "10/側",
                "type": "dynamic",
                "attributes": ["stability", "posterior_chain"],
                "progression_from": None
            },
            {
                "name": "側平板",
                "sets": 3, "reps": "20-30秒/側",
                "type": "isometric",
                "attributes": ["anti_lateral_flexion", "obliques"],
                "progression_from": None
            },
            {
                "name": "捲腹",
                "sets": 3, "reps": "15-20",
                "type": "dynamic",
                "attributes": ["rectus_abdominis", "basic"],
                "progression_from": None
            }
        ],
        "intermediate": [
            {
                "name": "Ab Wheel",
                "sets": 3, "reps": "10-12",
                "type": "dynamic",
                "attributes": ["anti_extension", "advanced"],
                "progression_from": "平板支撐"
            },
            {
                "name": "Pallof Press",
                "sets": 3, "reps": "12-15/側",
                "type": "anti_rotation",
                "attributes": ["rotation_resist", "functional"],
                "progression_from": None
            },
            {
                "name": "懸吊舉腿",
                "sets": 3, "reps": "10-15",
                "type": "dynamic",
                "attributes": ["lower_abs", "hip_flexor"],
                "progression_from": "捲腹"
            },
            {
                "name": "Russian Twist",
                "sets": 3, "reps": "20-30",
                "type": "rotation",
                "attributes": ["obliques", "rotation"],
                "progression_from": None
            },
            {
                "name": "Copenhagen Plank",
                "sets": 3, "reps": "20-30秒/側",
                "type": "isometric",
                "attributes": ["adductor", "lateral_stability"],
                "progression_from": "側平板"
            }
        ],
        "advanced": [
            {
                "name": "Dragon Flag",
                "sets": 3, "reps": "6-8",
                "type": "dynamic",
                "attributes": ["advanced", "full_body_tension"],
                "progression_from": "Ab Wheel"
            },
            {
                "name": "L-Sit Hold",
                "sets": 3, "reps": "20-30秒",
                "type": "isometric",
                "attributes": ["compression", "hip_flexor"],
                "progression_from": "懸吊舉腿"
            },
            {
                "name": "Turkish Get-Up",
                "sets": 3, "reps": "3/側",
                "type": "complex",
                "attributes": ["functional", "full_body"],
                "progression_from": None
            },
            {
                "name": "Weighted Ab Wheel",
                "sets": 3, "reps": "10-12",
                "type": "dynamic",
                "attributes": ["strength", "advanced"],
                "progression_from": "Ab Wheel"
            }
        ]
    },
    
    # ========== 上背矯正訓練 ==========
    "upper_back_corrective": {
        "beginner": [
            {
                "name": "彈力帶Face Pull",
                "sets": 3, "reps": "15-20",
                "type": "isolation",
                "attributes": ["corrective", "rear_delt"],
                "progression_from": None
            },
            {
                "name": "俯臥YTW",
                "sets": 3, "reps": "10/動作",
                "type": "isolation",
                "attributes": ["scapular", "posture"],
                "progression_from": None
            },
            {
                "name": "肩胛滑牆",
                "sets": 3, "reps": "10",
                "type": "mobility",
                "attributes": ["scapular_mobility", "thoracic"],
                "progression_from": None
            },
            {
                "name": "反向飛鳥 (輕重量)",
                "sets": 3, "reps": "12-15",
                "type": "isolation",
                "attributes": ["rear_delt", "rhomboids"],
                "progression_from": None
            }
        ],
        "intermediate": [
            {
                "name": "Face Pull",
                "sets": 4, "reps": "12-15",
                "type": "isolation",
                "attributes": ["rear_delt", "external_rotation"],
                "progression_from": "彈力帶Face Pull"
            },
            {
                "name": "反向飛鳥",
                "sets": 3, "reps": "12-15",
                "type": "isolation",
                "attributes": ["rear_delt", "scapular"],
                "progression_from": "反向飛鳥 (輕重量)"
            },
            {
                "name": "Cable Row (高位)",
                "sets": 3, "reps": "12-15",
                "type": "compound",
                "attributes": ["mid_traps", "rhomboids"],
                "progression_from": "彈力帶划船"
            },
            {
                "name": "W-Raises",
                "sets": 3, "reps": "12",
                "type": "isolation",
                "attributes": ["lower_traps", "scapular"],
                "progression_from": "俯臥YTW"
            }
        ],
        "advanced": [
            {
                "name": "Snatch Grip High Pull",
                "sets": 4, "reps": "8-10",
                "type": "compound",
                "attributes": ["upper_back", "power"],
                "progression_from": "Cable Row (高位)"
            },
            {
                "name": "Overhead Yoke Carry",
                "sets": 3, "reps": "20m",
                "type": "loaded_carry",
                "attributes": ["upper_back_stability", "functional"],
                "progression_from": None
            }
        ]
    },
    
    # ========== 臀部激活 ==========
    "glutes": {
        "beginner": [
            {
                "name": "臀橋",
                "sets": 3, "reps": "15-20",
                "type": "isolation",
                "attributes": ["glute_activation", "basic"],
                "progression_from": None
            },
            {
                "name": "蚌式開合",
                "sets": 3, "reps": "15/側",
                "type": "isolation",
                "attributes": ["glute_med", "hip_stability"],
                "progression_from": None
            },
            {
                "name": "側抬腿",
                "sets": 3, "reps": "15/側",
                "type": "isolation",
                "attributes": ["glute_med", "abduction"],
                "progression_from": None
            }
        ],
        "intermediate": [
            {
                "name": "單腿臀橋",
                "sets": 3, "reps": "12-15/腿",
                "type": "isolation",
                "attributes": ["unilateral", "glute_strength"],
                "progression_from": "臀橋"
            },
            {
                "name": "Hip Thrust",
                "sets": 4, "reps": "10-12",
                "type": "compound",
                "attributes": ["glute_mass", "hip_extension"],
                "progression_from": "臀橋"
            },
            {
                "name": "Cable Pull-Through",
                "sets": 3, "reps": "12-15",
                "type": "compound",
                "attributes": ["hip_hinge", "glute_ham"],
                "progression_from": "臀橋"
            }
        ],
        "advanced": [
            {
                "name": "Hip Thrust (大重量)",
                "sets": 4, "reps": "8-10",
                "type": "compound",
                "attributes": ["strength", "power"],
                "progression_from": "Hip Thrust"
            },
            {
                "name": "單腿Hip Thrust",
                "sets": 3, "reps": "10-12/腿",
                "type": "compound",
                "attributes": ["unilateral", "advanced"],
                "progression_from": "單腿臀橋"
            }
        ]
    },
    
    # ========== 旋轉肌群 ==========
    "rotator_cuff": {
        "beginner": [
            {
                "name": "彈力帶外旋",
                "sets": 3, "reps": "15-20",
                "type": "isolation",
                "attributes": ["external_rotation", "rehab"],
                "progression_from": None
            },
            {
                "name": "彈力帶內旋",
                "sets": 3, "reps": "15-20",
                "type": "isolation",
                "attributes": ["internal_rotation", "rehab"],
                "progression_from": None
            },
            {
                "name": "側臥外旋",
                "sets": 3, "reps": "12-15/側",
                "type": "isolation",
                "attributes": ["infraspinatus", "stability"],
                "progression_from": None
            }
        ],
        "intermediate": [
            {
                "name": "Cable外旋",
                "sets": 3, "reps": "12-15",
                "type": "isolation",
                "attributes": ["rotator_cuff", "controlled"],
                "progression_from": "彈力帶外旋"
            },
            {
                "name": "90/90外旋",
                "sets": 3, "reps": "10-12",
                "type": "isolation",
                "attributes": ["functional_position", "baseball"],
                "progression_from": "彈力帶外旋"
            }
        ],
        "advanced": [
            {
                "name": "Turkish Get-Up (輕重量)",
                "sets": 3, "reps": "3/側",
                "type": "complex",
                "attributes": ["shoulder_stability", "functional"],
                "progression_from": "Cable外旋"
            }
        ]
    }
}


# ==================== 智能動作選擇邏輯 ====================

def select_exercises_for_hashtags(selected_hashtags, fitness_level, week_num, days_per_week=3, split_type='mixed', equipment_preference='mixed'):
    """
    根據選擇的標籤智能選擇動作
    
    Args:
        selected_hashtags: 使用者選擇的標籤列表
        fitness_level: 訓練水平 (beginner/intermediate/advanced)
        week_num: 第幾週 (1-4)
        days_per_week: 每週訓練天數
        split_type: 訓練分化方式 ('isolated': 單一部位, 'mixed': 混合訓練)
        equipment_preference: 器材偏好 ('bodyweight': 徒手, 'equipment': 器械, 'mixed': 混合)
    
    Returns:
        dict: 每天的動作清單
    """
    import random
    
    # 1. 分析標籤類型
    corrective_tags = []
    goal_tags = []
    
    for tag in selected_hashtags:
        tag_info = HASHTAG_MUSCLE_MAPPING.get(tag, {})
        tag_type = tag_info.get("type", "")
        
        if tag_type == "corrective" or tag_type == "rehab":
            corrective_tags.append(tag)
        else:
            goal_tags.append(tag)
    
    # 2. 確定訓練重點分配
    corrective_ratio = 0.6 if corrective_tags else 0.0
    goal_ratio = 1.0 - corrective_ratio
    
    # 3. 收集所有目標肌群
    all_target_muscles = set()
    for tag in selected_hashtags:
        tag_info = HASHTAG_MUSCLE_MAPPING.get(tag, {})
        all_target_muscles.update(tag_info.get("primary", []))
        all_target_muscles.update(tag_info.get("secondary", []))
    
    all_target_muscles = list(all_target_muscles)
    
    # 4. 為每一天選擇動作
    weekly_plan = {}
    
    # 根據日期分配肌群
    for day_num in range(days_per_week):
        day_exercises = []
        
        # 根據分化類型決定肌群分配
        if split_type == 'isolated':
            # 單一部位訓練：每天專注一個主要肌群
            muscle_rotation = list(all_target_muscles)
            if day_num < len(muscle_rotation):
                day_muscles = [muscle_rotation[day_num]]
            else:
                day_muscles = [muscle_rotation[day_num % len(muscle_rotation)]]
        else:
            # 混合訓練：推拉腿分化
            if day_num == 0:
                # Day 1: 上半身推 + 核心
                day_muscles = [m for m in all_target_muscles if m in ['chest', 'front_delts', 'triceps', 'shoulders', 'core', 'abs']]
            elif day_num == 1:
                # Day 2: 下半身
                day_muscles = [m for m in all_target_muscles if m in ['quads', 'glutes', 'hamstrings', 'legs']]
            elif day_num == 2:
                # Day 3: 上半身拉 + 核心
                day_muscles = [m for m in all_target_muscles if m in ['back', 'upper_back', 'lats', 'biceps', 'rear_delts', 'core', 'abs']]
            elif day_num == 3:
                # Day 4: 上推 (重復，不同動作)
                day_muscles = [m for m in all_target_muscles if m in ['chest', 'shoulders', 'triceps']]
            else:
                # Day 5+: 弱點或輔助訓練
                day_muscles = all_target_muscles[:3]
        
        if not day_muscles:
            day_muscles = all_target_muscles[:2]
        
        # 5. 為這一天選擇動作 - 確保每天動作數量一致
        target_exercises_per_day = 5  # 每天固定5個動作
        
        # 決定當日 Focus 標籤
        day_focus_label = "Training"
        if split_type == 'isolated':
            # 單一部位: 取主要肌群名稱
            primary_muscle = day_muscles[0] if day_muscles else "General"
            # 簡單翻譯映射 (可選)
            name_map = {"chest": "Chest", "back": "Back", "legs": "Legs", "shoulders": "Shoulders", "arms": "Arms", "core": "Core"}
            day_focus_label = f"{name_map.get(primary_muscle, primary_muscle.capitalize())} Focus"
        else:
            # 推拉腿: 根據天數固定
            if day_num == 0: day_focus_label = "Push Day"
            elif day_num == 1: day_focus_label = "Leg Day"
            elif day_num == 2: day_focus_label = "Pull Day"
            elif day_num == 3: day_focus_label = "Upper Power"
            else: day_focus_label = "Full Body"

        # 優先選擇矯正性動作
        if corrective_tags:
            corrective_count = min(2, target_exercises_per_day)  # 最多2個矯正動作
            for _ in range(corrective_count):
                selected_exercise = _select_corrective_exercise(corrective_tags, day_muscles, fitness_level, week_num, equipment_preference)
                if selected_exercise and selected_exercise not in day_exercises:
                    day_exercises.append(selected_exercise)
        
        # 填充目標導向動作，直到達到目標數量
        attempts = 0
        max_attempts = 20  # 防止無限循環
        
        while len(day_exercises) < target_exercises_per_day and attempts < max_attempts:
            selected_exercise = _select_goal_exercise(day_muscles, fitness_level, week_num, goal_tags, equipment_preference)
            if selected_exercise:
                # 檢查是否已經有相同名稱的動作
                if not any(ex.get('name') == selected_exercise.get('name') for ex in day_exercises):
                    day_exercises.append(selected_exercise)
            attempts += 1
        
        # 如果還是不夠，從所有肌群選擇通用動作
        if len(day_exercises) < target_exercises_per_day:
            all_possible_muscles = list(all_target_muscles)
            while len(day_exercises) < target_exercises_per_day and all_possible_muscles:
                muscle = all_possible_muscles.pop(0) if all_possible_muscles else day_muscles[0]
                selected_exercise = _select_goal_exercise([muscle], fitness_level, week_num, goal_tags, equipment_preference)
                if selected_exercise and not any(ex.get('name') == selected_exercise.get('name') for ex in day_exercises):
                    day_exercises.append(selected_exercise)
        
        # 6. 根據週數調整動作參數
        day_exercises = [_adjust_for_week(ex, week_num) for ex in day_exercises]
        
        weekly_plan[f"day_{day_num + 1}"] = {
            "exercises": day_exercises,
            "focus": day_focus_label
        }
    
    return weekly_plan



def _filter_by_equipment(exercises, equipment_preference):
    """
    根據器材偏好過濾動作
    
    Args:
        exercises: 動作列表
        equipment_preference: 'bodyweight', 'equipment', 或 'mixed'
    
    Returns:
        過濾後的動作列表
    """
    if equipment_preference == 'mixed':
        return exercises
    
    bodyweight_keywords = ['徒手', '伏地挺身', 'Push-up', '引體向上', 'Pull-up', 'Chin-up', 
                          '平板', 'Plank', '捲腹', '舉腿', 'L-Sit', 'Dip', '撐體', 
                          'Dead Bug', 'Bird Dog', 'Hollow', 'Dragon Flag']
    
    equipment_keywords = ['槓鈴', '啞鈴', '機器', 'Cable', '滑輪', '腿推', '腿彎舉', 
                         '腿伸展', 'Smith', 'Barbell', 'Dumbbell', 'Machine']
    
    filtered = []
    for ex in exercises:
        name = ex.get('name', '')
        equipment_type = ex.get('equipment', '')
        
        # 優先使用 equipment 標記
        if equipment_type:
            if equipment_preference == 'bodyweight' and equipment_type == 'bodyweight':
                filtered.append(ex)
            elif equipment_preference == 'equipment' and equipment_type in ['dumbbells', 'barbell', 'machine', 'cable']:
                filtered.append(ex)
        else:
            # 根據名稱判斷
            is_bodyweight = any(keyword in name for keyword in bodyweight_keywords)
            is_equipment = any(keyword in name for keyword in equipment_keywords)
            
            if equipment_preference == 'bodyweight' and (is_bodyweight or not is_equipment):
                filtered.append(ex)
            elif equipment_preference == 'equipment' and (is_equipment or not is_bodyweight):
                filtered.append(ex)
    
    # 如果過濾後沒有動作，返回原列表
    return filtered if filtered else exercises


def _select_corrective_exercise(corrective_tags, day_muscles, fitness_level, week_num, equipment_preference='mixed'):
    """選擇矯正性動作"""
    import random
    
    for tag in corrective_tags:
        tag_info = HASHTAG_MUSCLE_MAPPING.get(tag, {})
        tag_muscles = tag_info.get("primary", []) + tag_info.get("secondary", [])
        
        # 找到符合今天訓練的肌群
        matching_muscles = [m for m in tag_muscles if m in day_muscles]
        
        if matching_muscles:
            # 選擇對應的動作庫
            muscle_category = matching_muscles[0]
            
            # 特殊處理
            if "#駝背改善" in tag or "#肩膀痠痛" in tag:
                muscle_category = "upper_back_corrective"
            elif "#核心無力" in tag or "#腰痛困擾" in tag:
                muscle_category = "core"
            elif "#久坐族" in tag or muscle_category in ['glutes', 'hamstrings']:
                muscle_category = "glutes"
            elif "#肩膀痠痛" in tag and "rotator" in tag_muscles:
                muscle_category = "rotator_cuff"
            
            if muscle_category in EXERCISE_DATABASE:
                exercises = EXERCISE_DATABASE[muscle_category].get(fitness_level, [])
                if exercises:
                    # 根據器材偏好過濾
                    filtered_exercises = _filter_by_equipment(exercises, equipment_preference)
                    if filtered_exercises:
                        return random.choice(filtered_exercises).copy()
    
    return None


def _select_goal_exercise(day_muscles, fitness_level, week_num, goal_tags, equipment_preference='mixed'):
    """選擇目標導向動作"""
    import random
    
    for muscle in day_muscles:
        # 映射肌肉到對應的動作庫
        muscle_category = muscle
        
        # 特殊映射
        if muscle in ['biceps', 'brachialis', 'forearms']:
            muscle_category = "arms_biceps"
        elif muscle in ['triceps']:
            muscle_category = "arms_triceps"
        elif muscle in ['quads', 'hamstrings', 'glutes']:
            muscle_category = "legs"
        elif muscle in ['front_delts', 'rear_delts', 'delts']:
            muscle_category = "shoulders"
        elif muscle in ['lats', 'traps', 'rhomboids', 'upper_back']:
            muscle_category = "back"
        elif muscle in ['abs', 'obliques']:
            muscle_category = "core"
        elif muscle == 'chest':
            muscle_category = "chest"
        
        if muscle_category in EXERCISE_DATABASE:
            exercises = EXERCISE_DATABASE[muscle_category].get(fitness_level, [])
            if exercises:
                # 根據目標標籤篩選動作屬性
                if "#力量突破" in goal_tags:
                    # 優先選擇複合動作
                    strength_exercises = [ex for ex in exercises if ex.get("type") == "compound"]
                    if strength_exercises:
                        # 根據器材偏好過濾
                        filtered_exercises = _filter_by_equipment(strength_exercises, equipment_preference)
                        if filtered_exercises:
                            return random.choice(filtered_exercises).copy()
                
                # 根據器材偏好過濾
                filtered_exercises = _filter_by_equipment(exercises, equipment_preference)
                if filtered_exercises:
                    return random.choice(filtered_exercises).copy()
    
    return None


def _adjust_for_week(exercise, week_num):
    """根據週數調整訓練參數（漸進超負荷）"""
    ex = exercise.copy()
    
    if week_num == 1:
        # Week 1: 建立基礎，保持原參數
        pass
    
    elif week_num == 2:
        # Week 2: 增加組數
        if isinstance(ex.get('sets'), int):
            ex['sets'] = ex['sets'] + 1
    
    elif week_num == 3:
        # Week 3: 增加組數 + 降低次數（提升強度）
        if isinstance(ex.get('sets'), int):
            ex['sets'] = ex['sets'] + 1
        
        # 降低次數範圍
        if '-' in str(ex.get('reps', '')):
            parts = ex['reps'].split('-')
            if len(parts) == 2 and parts[0].isdigit() and parts[1].replace('秒', '').isdigit():
                lower = max(int(parts[0]) - 2, 1)
                if '秒' in parts[1]:
                    upper = parts[1]
                else:
                    upper = max(int(parts[1]) - 2, lower + 2)
                ex['reps'] = f"{lower}-{upper}"
    
    elif week_num == 4:
        # Week 4: 減量週（Deload）
        if isinstance(ex.get('sets'), int):
            ex['sets'] = max(ex['sets'] - 1, 2)
    
    return ex


# ==================== 主要生成函數 ====================

def generate_plan_from_hashtags(user_id, selected_hashtags, fitness_level='intermediate', days_per_week=3, split_type='mixed', equipment_preference='mixed'):
    """
    生成完整的4週訓練計劃
    
    Args:
        user_id: 使用者ID
        selected_hashtags: 選擇的標籤列表
        fitness_level: 訓練等級
        days_per_week: 每週訓練天數
        split_type: 訓練分化方式 ('isolated': 單一部位, 'mixed': 混合訓練)
        equipment_preference: 器材偏好 ('bodyweight': 徒手, 'equipment': 器械, 'mixed': 混合)
    
    Returns:
        dict: 完整訓練計劃
    """
    
    # 1. 從標籤提取所有目標肌群
    target_muscles = set()
    for hashtag in selected_hashtags:
        tag_info = HASHTAG_MUSCLE_MAPPING.get(hashtag, {})
        target_muscles.update(tag_info.get("primary", []))
        target_muscles.update(tag_info.get("secondary", []))
    
    target_muscles = list(target_muscles)
    
    # 2. 生成 Target Analysis（包含標籤來源）
    target_analysis = {}
    
    # 為每個標籤建立肌群對應
    for hashtag in selected_hashtags:
        tag_info = HASHTAG_MUSCLE_MAPPING.get(hashtag, {})
        primary_muscles = tag_info.get("primary", [])
        focus = tag_info.get("focus", "訓練強化")
        
        for muscle in primary_muscles:
            if muscle not in target_analysis:
                # 收集該肌群的主要動作
                primary_exercises = _get_primary_exercises_for_muscle(muscle, fitness_level)
                
                target_analysis[muscle] = {
                    "primary_exercises": primary_exercises[:3],  # 取前3個
                    "frequency": f"{days_per_week}x per week",
                    "intensity": _get_intensity_for_level(fitness_level),
                    "focus": focus,
                    "source_hashtags": [hashtag],  # 記錄來源標籤
                    "training_purpose": tag_info.get("focus", "訓練強化")  # 訓練目的
                }
            else:
                # 如果已經存在，添加額外的標籤來源
                if hashtag not in target_analysis[muscle]["source_hashtags"]:
                    target_analysis[muscle]["source_hashtags"].append(hashtag)
    
    # 3. 生成4週訓練計劃
    weeks = []
    for week_num in range(1, 5):
        week_data = {
            "week_number": week_num,
            "focus": _get_week_focus(week_num),
            "days": []
        }
        
        # 使用智能選擇算法
        weekly_plan = select_exercises_for_hashtags(
            selected_hashtags, 
            fitness_level, 
            week_num,
            days_per_week=days_per_week,
            split_type=split_type,
            equipment_preference=equipment_preference
        )
        
        for day_key, day_content in weekly_plan.items():
            day_num = int(day_key.split('_')[1])
            
            # Handle new dict format vs old list format (safety check)
            if isinstance(day_content, dict) and 'exercises' in day_content:
                exercises = day_content['exercises']
                day_focus = day_content.get('focus', 'General Training')
            else:
                exercises = day_content
                day_focus = 'General Training'
            
            week_data["days"].append({
                "day_number": day_num,
                "day_name": _get_day_name(day_num - 1, days_per_week),
                "focus": day_focus,
                "exercises": exercises,
                "time": _estimate_workout_time(exercises)
            })
        
        weeks.append(week_data)
    
    # 4. 識別ACE動作
    ace_exercises = _identify_ace_exercises(target_muscles, fitness_level, selected_hashtags)
    
    # 5. 建立回應
    return {
        "plan_name": f"{', '.join(selected_hashtags)} 訓練計劃",
        "selected_hashtags": selected_hashtags,  # 新增：返回選中的標籤列表
        "target_muscle_groups": target_muscles,
        "target_analysis": target_analysis,
        "weeks": weeks,
        "ace_exercises": ace_exercises,
        "fitness_level": fitness_level,
        "days_per_week": days_per_week,
        "program_type": _determine_program_type(selected_hashtags)
    }


# ==================== 輔助函數 ====================

def _get_primary_exercises_for_muscle(muscle, fitness_level):
    """取得特定肌群的主要動作"""
    # 映射到動作庫
    muscle_map = {
        "chest": "chest",
        "back": "back",
        "upper_back": "upper_back_corrective",
        "legs": "legs",
        "quads": "legs",
        "glutes": "glutes",
        "hamstrings": "legs",
        "shoulders": "shoulders",
        "biceps": "arms_biceps",
        "triceps": "arms_triceps",
        "core": "core",
        "abs": "core",
        "rotator_cuff": "rotator_cuff"
    }
    
    category = muscle_map.get(muscle, muscle)
    
    if category in EXERCISE_DATABASE:
        exercises = EXERCISE_DATABASE[category].get(fitness_level, [])
        return [ex["name"] for ex in exercises[:5]]
    
    return ["基礎訓練"]


def _get_intensity_for_level(level):
    """取得訓練強度描述"""
    intensities = {
        "beginner": "Moderate (12-15 reps)",
        "intermediate": "Moderate-High (8-12 reps)",
        "advanced": "High (5-8 reps)"
    }
    return intensities.get(level, "Moderate")


def _get_week_focus(week_num):
    """取得每週訓練重點"""
    focuses = {
        1: "Foundation & Form",
        2: "Volume Increase",
        3: "Intensity Peak",
        4: "Active Recovery"
    }
    return focuses.get(week_num, "Training")


def _get_day_name(day_num, days_per_week=3):
    """取得日期名稱"""
    if days_per_week == 3:
        days = ['Monday', 'Wednesday', 'Friday']
    elif days_per_week == 4:
        days = ['Monday', 'Tuesday', 'Thursday', 'Friday']
    else:
        days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    
    return days[day_num] if day_num < len(days) else f"Day {day_num + 1}"


def _estimate_workout_time(exercises):
    """估算訓練時間 - 固定為45-60分鐘"""
    # 不論動作數量，統一設定為45-60分鐘
    # 這樣可以確保訓練時長一致性
    return "45-60"


def _identify_ace_exercises(target_muscles, fitness_level, selected_hashtags):
    """識別ACE動作（最有效動作）"""
    ace_map = {
        "chest": ["槓鈴臥推", "啞鈴臥推", "雙槓撐體"],
        "back": ["硬舉", "引體向上", "槓鈴划船"],
        "legs": ["槓鈴深蹲", "羅馬尼亞硬舉", "保加利亞分腿蹲"],
        "shoulders": ["槓鈴肩推", "啞鈴肩推", "阿諾推舉"],
        "arms": ["槓鈴彎舉", "窄握臥推"],
        "core": ["Ab Wheel", "懸吊舉腿", "Pallof Press"]
    }
    
    ace_exercises = []
    for muscle in target_muscles:
        if muscle in ace_map:
            ace_exercises.extend(ace_map[muscle])
    
    # 根據標籤調整
    if "#力量突破" in selected_hashtags:
        ace_exercises = ["深蹲", "硬舉", "臥推", "肩推"]
    
    return list(set(ace_exercises))[:5]


def _determine_program_type(selected_hashtags):
    """判斷訓練計劃類型"""
    corrective_count = sum(1 for tag in selected_hashtags 
                          if HASHTAG_MUSCLE_MAPPING.get(tag, {}).get("type") in ["corrective", "rehab"])
    
    if corrective_count >= len(selected_hashtags) * 0.6:
        return"Corrective & Rehabilitation"
    elif "#增肌" in selected_hashtags or "#健美比賽" in selected_hashtags:
        return "Hypertrophy"
    elif "#力量突破" in selected_hashtags:
        return "Strength"
    elif "#減脂" in selected_hashtags:
        return "Fat Loss & Conditioning"
    else:
        return "General Fitness"

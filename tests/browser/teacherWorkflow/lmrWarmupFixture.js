/*
 * The production Warm-Up behind the lmr-wu-1 incident, for `?questions=lmr`.
 *
 * Verbatim from docs/assignments/Algebra1_Linear_Multiple_Representations_V5_FAMILY_UPDATED.json
 * (the family-backed `linear.representationSort` card sorts), plus that
 * lesson's first Classwork board (`representationBridge`) placed in the
 * Warm-Up too, so a second draft-backed interactive family goes through the
 * same timed close and teacher reopen (the scope audit).
 *
 * Generated; regenerate rather than edit by hand.
 */
export const LMR_WARMUP_QUESTIONS = Object.freeze([
  {
    "questionId": "lmr-wu-1",
    "standard": "A.3C",
    "alignments": [
      {
        "framework": "teks",
        "code": "A.3C",
        "role": "primary"
      },
      {
        "framework": "teks",
        "code": "A.2B",
        "role": "secondary"
      }
    ],
    "type": "representationMatch",
    "studentActions": [
      "connectRepresentations"
    ],
    "difficultyBand": 1,
    "dok": 2,
    "questionFamily": {
      "id": "linear.representationSort",
      "version": 1,
      "constraints": {
        "slopeRange": [
          1,
          3
        ],
        "interceptRange": [
          -6,
          6
        ]
      }
    },
    "prompt": "Two different lines are hiding in these cards: {{line1}} and {{line2}}. Sort every card into the line it describes.",
    "representations": {
      "mode": "linearConnections",
      "task": "group",
      "cardKinds": [
        "slopeIntercept",
        "standard",
        "pointSlope",
        "graph",
        "xIntercept"
      ],
      "sets": [
        {
          "id": "line-a"
        },
        {
          "id": "line-b"
        }
      ]
    }
  },
  {
    "questionId": "lmr-wu-2",
    "standard": "A.3B",
    "alignments": [
      {
        "framework": "teks",
        "code": "A.3B",
        "role": "primary"
      },
      {
        "framework": "teks",
        "code": "A.2C",
        "role": "secondary"
      }
    ],
    "type": "representationMatch",
    "studentActions": [
      "connectRepresentations"
    ],
    "difficultyBand": 1,
    "dok": 2,
    "questionFamily": {
      "id": "linear.representationSort",
      "version": 1,
      "constraints": {
        "slopeRange": [
          2,
          6
        ],
        "interceptRange": [
          10,
          40
        ]
      }
    },
    "prompt": "One situation grows and one shrinks. Sort each card into the situation it describes.",
    "representations": {
      "mode": "linearConnections",
      "task": "group",
      "cardKinds": [
        "context",
        "slopeIntercept",
        "graph",
        "slope",
        "yIntercept"
      ],
      "sets": [
        {
          "id": "savings",
          "context": "Maya has ${{start}} saved and adds ${{rate}} every week."
        },
        {
          "id": "tub",
          "context": "A tub holds {{start}} gallons of water and drains {{rate}} gallons every minute."
        }
      ]
    }
  }
]);

export const LMR_BRIDGE_QUESTION = Object.freeze({
  "questionId": "lmr-cw-1",
  "standard": "A.2B",
  "alignments": [
    {
      "framework": "teks",
      "code": "A.2B",
      "role": "primary"
    },
    {
      "framework": "teks",
      "code": "A.3A",
      "role": "secondary"
    },
    {
      "framework": "teks",
      "code": "A.3C",
      "role": "secondary"
    }
  ],
  "type": "representationBridge",
  "mode": "linearMultipleRepresentations",
  "interactionMode": "process",
  "studentActions": [
    "connectLinearRepresentations"
  ],
  "difficultyBand": 2,
  "dok": 2,
  "questionFamily": {
    "id": "linear.multipleRepresentations",
    "version": 1,
    "constraints": {
      "given": "standardForm",
      "slope": "fraction",
      "slopeRange": [
        1,
        3
      ],
      "denominatorRange": [
        2,
        4
      ],
      "interceptRange": [
        -6,
        6
      ],
      "standardScale": 2
    }
  },
  "prompt": "You are given the standard form equation {{given}}. Build every other representation of this same line, in any order you like.",
  "feedbackTiming": "guided"
});

"""Portable CONTENT generator; not a MathMaster importer or browser grading code.
Run with Python 3.10+: python generate_reference.py --seed 104 --out generated
Keep this script, banks, parameters, and keys on the teacher/server side.
"""
import argparse
import copy
import json
import random
from pathlib import Path


def field(name, label, answer, kind="number", weight=1, tolerance=0):
    return {"id": name, "label": label, "response": kind,
            "weight": weight, "key": answer, "absoluteTolerance": tolerance}


def item(num, skill, prompt, fields, stimulus=None, math=None):
    return {"id": f"T{num:02}", "originalQuestion": num, "skill": skill,
            "prompt": prompt, "fields": fields, "stimulus": stimulus or {},
            "privateMath": math or {}, "itemWeight": 1}


def graph(fn, xmin, xmax, ymin, ymax, xstep=1, ystep=1, segment=False,
          xlabel="x", ylabel="y"):
    samples = [[round(xmin+(xmax-xmin)*i/240, 8),
                round(fn(xmin+(xmax-xmin)*i/240), 8)] for i in range(241)]
    return {"type": "graph", "samples": samples,
            "viewport": {"x": [xmin, xmax], "y": [ymin, ymax]},
            "tickStep": {"x": xstep, "y": ystep},
            "axisLabels": {"x": xlabel, "y": ylabel},
            "curve": "closed_segment" if segment else "arrows_both_ends",
            "showEquation": False, "highlightFeatures": False,
            "labelAllMajorTicks": True, "clipCurveToViewport": True}


def make_test(seed):
    r = random.Random(seed)
    out = []
    cases = [
        "On hotter days, a community pool records both more sunscreen sales and more heat-related first-aid visits.",
        "A store records that umbrella sales increase on days when more drivers use windshield wipers.",
        "A town records that ice-cream sales and swimming-pool visits both rise during hotter weeks.",
        "A school observes that students who spend more time practicing tend to earn higher quiz scores. No controlled experiment was conducted.",
        "A library observes that students who report more hours of reading tend to score higher on vocabulary quizzes. No controlled experiment was conducted.",
        "A parking garage observes that raincoat use and wet sidewalks both become more common on rainy days.",
        "A city observes that outdoor temperatures and home-heating costs tend to move in opposite directions.",
        "A school observes that longer travel distances tend to be associated with longer bus rides."]
    case = r.choice(cases) + f" The report summarizes observations from {r.randint(20,90)} days."
    out.append(item(1, "association_causation", case + " Does the information describe an association? Does it provide enough evidence to conclude that one recorded variable causes the other?",
                    [field("association", "Association described?", True, "yes_no", .5),
                     field("causation", "Causation established by this information?", False, "yes_no", .5)],
                    math={"case": case, "causalEvidence": "observational only"}))
    a1 = r.randint(21, 69); d = r.choice([-9, -8, -6, -5, -4, -3, 3, 4, 5, 6, 8])
    terms = [a1+i*d for i in range(5)]
    out.append(item(2, "explicit_arithmetic", "The first five terms are shown. The first term has n = 1. Complete the explicit rule aₙ = [coefficient]n + [constant]. Enter a signed value in each box.",
                    [field("coefficient", "Coefficient of n", d, weight=.5), field("constant", "Signed constant", a1-d, weight=.5)],
                    {"type": "sequence", "terms": terms}, {"a1": a1, "difference": d}))
    def linear(num, skill, two=False, zero=False):
        xi = r.choice([-6, -5, -4, -3, -2, 2, 3, 4, 5, 6]); b = r.choice([-8, -6, -4, -3, -2, 2, 3, 4, 6, 8])
        g = graph(lambda x: b*(1-x/xi), -10, 10, -10, 10)
        if two:
            fs=[field("xIntercept", "x-intercept (x, y)", [xi, 0], "coordinate_or_graph_point", .5), field("yIntercept", "y-intercept (x, y)", [0, b], "coordinate_or_graph_point", .5)]
            p="Identify the x-intercept and y-intercept. Place one point for each label, or enter its coordinate."
        elif zero:
            fs=[field("zero", "Zero: x =", xi, "number_or_graph_x")]
            p="Determine the zero of the function. Enter its x-value, or select its point on the x-axis."
        else:
            fs=[field("yIntercept", "y-intercept value", b)]
            p="What is the y-intercept value of this function? Enter the y-value."
        return item(num, skill, p, fs, g, {"xIntercept": xi, "yIntercept": b})
    out.append(linear(3, "linear_intercepts", two=True))
    out.append(linear(4, "y_intercept"))
    a1=r.randint(3,15); dt=r.choice([12,16,18,24,26,32]); d=dt/10
    terms=[round(a1+i*dt/10,1) for i in range(4)]
    out.append(item(5, "recursive_arithmetic", f"A sequence has a₁ = {a1} and aₙ = aₙ₋₁ + {d:g} for n ≥ 2. Enter a₂, a₃, and a₄.",
                    [field(f"a{i+1}", f"a{i+1}", terms[i], weight=1/3) for i in range(1,4)],
                    {"type":"recursive_rule", "firstTerm":a1,"commonDifference":d}, {"a1":a1,"differenceTenths":dt}))
    fee=r.randint(12,28); ticket=r.choice([2495,2750,2995,3250,3495,3650]); n=r.choice([3,4,5])
    domain=list(range(1,n+1)); costs=[round((fee*100+ticket*x)/100,2) for x in domain]
    out.append(item(6, "discrete_range", f"An outing costs ${ticket/100:.2f} per person plus ${fee:.2f} for one vehicle. This vehicle may carry 1 through {n} people, in whole numbers. The table lists every allowed group size. Enter the range as a set of total costs.",
                    [field("range", "Range (dollars)", costs, "numeric_set")],
                    {"type":"table","headers":["People, p","Total cost, c ($)"],"rows":list(zip(domain,costs))},
                    {"fee":fee,"ticketCents":ticket,"domain":domain}))
    pages=r.choice([240,300,360,420,480]); hours=r.choice([8,10,12,14,16])
    g=graph(lambda x: pages*(1-x/hours),0,hours,0,pages,2,60,True,"Reading time, x (hours)","Pages remaining, y")
    g["viewport"]={"x":[-1,hours+2],"y":[-30,pages+60]}
    out.append(item(7,"continuous_range","The graph shows pages remaining while a student reads, from the start until the book is finished. Complete the inequality describing the range. Use x or y in the variable box.",
                    [field("lower","Lower value",0,weight=.25),field("leftComparison","Left comparison","≤","comparison",.125),field("variable","Variable","y","variable",.25),field("rightComparison","Right comparison","≤","comparison",.125),field("upper","Upper value",pages,weight=.25)],
                    g,{"pages":pages,"hours":hours}))
    out.append(linear(8,"linear_zero",zero=True))
    rate=r.choice([45,55,65,75,85,95]); times=sorted(r.sample([1,2,3,4,5],r.choice([2,3])))
    out.append(item(9,"context_domain_range",f"A recreation room costs ${rate} per hour. It can be reserved only for the following whole-hour durations: {', '.join(map(str,times))}. The input is hours reserved and the output is cost. Enter the domain and range as sets.",
                    [field("domain","Domain (hours)",times,"numeric_set",.5),field("range","Range (dollars)",[rate*t for t in times],"numeric_set",.5)],
                    math={"rate":rate,"times":times}))
    h=r.randint(-2,2); w=r.choice([2,3,4]); roots=[h-w,h+w]
    g=graph(lambda x:(x-roots[0])*(x-roots[1]),-8,8,-20,20,1,2)
    out.append(item(10,"quadratic_zeros","Identify both zeros of the quadratic function. Select two points on the x-axis, or enter the two x-values. Order does not matter.",
                    [field("zeros","Zeros",roots,"two_numbers_or_graph_x_set")],g,{"roots":roots,"axis":h}))
    end=r.choice([32,40,48,56,64,72]); top=r.choice([32,40,48,56]); h=end/2
    g=graph(lambda x:4*top*x*(end-x)/(end*end),0,end,0,top,8,8,True,"Horizontal distance, x (yards)","Height, y (feet)")
    g["viewport"]={"x":[-4,end+8],"y":[-4,top+8]}
    out.append(item(11,"axis_symmetry","A ball's path is shown. Complete the equation of the axis of symmetry: [variable] = [value].",
                    [field("variable","Variable","x","variable",.25),field("value","Axis value",h,weight=.75)],g,{"end":end,"height":top,"axis":h}))
    offset=r.randint(-10,10)
    relations=[
        {"id":"A","type":"table","headers":["x","y"],"rows":[[offset+i,4] for i in range(4)]},
        {"id":"B","type":"point_graph","points":[[offset,1],[offset,3],[offset+2,2],[offset+3,4]],"viewport":{"x":[min(-2,offset-2),max(2,offset+5)],"y":[-2,6]},"tickStep":{"x":1,"y":1}},
        {"id":"C","type":"table","headers":["x","y"],"rows":[[offset,-2],[offset,-2],[offset+1,1],[offset+3,3]]}]
    r.shuffle(relations)
    out.append(item(12,"function_rule","Classify each relation as Function or Not a function. Then enter an input with two different outputs from a relation you classified as Not a function.",
                    [field("A","Relation A","function","function_classification",.25),field("B","Relation B","not_function","function_classification",.25),field("C","Relation C","function","function_classification",.25),field("conflictInput","An input with two different outputs",offset,weight=.25)],
                    {"type":"relations","relations":relations}, {"conflictingInput":offset}))
    intercept=r.randint(140,200); slope=-r.choice([6,8,10,12]); shift=r.choice([0,.25,.5])
    xs=[5+shift,6+shift,7+shift,8+shift,9+shift,10+shift]
    # Noise is orthogonal to constant and x; OLS is exactly the intended line.
    noise=[2,-1,-1,-1,-1,2]; ys=[round(intercept+slope*x+e,2) for x,e in zip(xs,noise)]
    p1=7.5+shift; p2=11+shift
    predict=[int(intercept+slope*p1+.5),int(intercept+slope*p2+.5)]
    out.append(item(13,"regression_prediction",f"A snack stand recorded price and number sold on six days. Use linear regression to find a line of best fit. Predict the number sold at ${p1:.2f} and at ${p2:.2f}. Round each prediction to the nearest whole item. Do not force the line through the origin.",
                    [field("prediction1",f"Prediction at ${p1:.2f}",predict[0],weight=.5,tolerance=1),field("prediction2",f"Prediction at ${p2:.2f}",predict[1],weight=.5,tolerance=1)],
                    {"type":"table","headers":["Price ($)","Number sold"],"rows":list(zip(xs,ys)),"calculator":"linear_regression","requestedPrices":[p1,p2]},
                    {"intercept":intercept,"slope":slope,"predictions":predict}))
    return out


EXPLANATIONS={
 "association_causation":"The information shows related variables. Observation alone does not establish that one causes the other; another factor may influence both.",
 "explicit_arithmetic":"Find the common difference d. Since the first term is at n = 1, aₙ = dn + (a₁ − d).",
 "linear_intercepts":"The x-intercept has y = 0. The y-intercept has x = 0. Coordinates are entered as (x, y).",
 "y_intercept":"Read the y-value where the line crosses the vertical axis.",
 "recursive_arithmetic":"Start with the supplied first term and add the common difference once for each next term.",
 "discrete_range":"Range means outputs. Whole-number group sizes give individual total costs, not every real number between the smallest and largest costs.",
 "continuous_range":"Range uses y-values. The closed endpoints include zero and the starting number of pages, along with all intermediate values.",
 "linear_zero":"A zero is the x-value where the graph has y = 0. Report the x-value rather than the y-intercept.",
 "context_domain_range":"The domain contains allowed hour inputs; the range contains their corresponding costs. Only the listed reservation lengths are allowed.",
 "quadratic_zeros":"Each zero is an x-value where the parabola crosses the x-axis. Two different crossings give two zeros.",
 "axis_symmetry":"The axis of symmetry is a vertical line through the vertex, so its equation is x = the vertex's x-coordinate.",
 "function_rule":"A function gives each input exactly one output. Different inputs can share an output, and a repeated identical pair does not create a second output.",
 "regression_prediction":"Use all six pairs with linear regression y = mx + b. Substitute each requested price for x, then round the predicted y-value."}


def make_review(seed):
    base=make_test(seed)
    groups=[("R01","Association detective",[1]),("R02","Sequence builder",[2,5]),
            ("R03","Linear graph features",[3,4,8]),("R04","Domain and range",[6,7,9]),
            ("R05","Quadratic graph features",[10,11]),("R06","Is it a function?",[12]),
            ("R07","Trend and prediction",[13])]
    tasks=[]
    for id,title,nums in groups:
        parts=[copy.deepcopy(base[i-1]) for i in nums]
        # Linear review uses one common graph for all three skills, reducing time.
        if id=="R03":
            first=parts[0]; xi=first["privateMath"]["xIntercept"]; b=first["privateMath"]["yIntercept"]
            first["fields"].append(field("zero","Zero: x =",xi,weight=.5))
            first["fields"][0]["weight"]=first["fields"][1]["weight"]=.25
            first["prompt"]="Use this one graph to identify both intercepts and the zero."
            parts=[first]
        for part in parts:
            part["id"]=f"{id}-{part['originalQuestion']}"
            part["feedbackExplanation"]=EXPLANATIONS[part["skill"]]
        tasks.append({"id":id,"title":title,"coversOriginalQuestions":nums,
                      "parts":parts,"skillWeight":1,"feedback":"immediate_after_submit",
                      "retry":"new_parallel_task_after_feedback"})
    return tasks


def public(value):
    if isinstance(value,list):return [public(v) for v in value]
    if isinstance(value,dict):
        return {k:public(v) for k,v in value.items() if k not in
                {"key","privateMath","feedbackExplanation","absoluteTolerance","originalQuestion"}}
    return value


def write_json(path,value):
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")


def generate(out,seed=104):
    out=Path(out);out.mkdir(parents=True,exist_ok=True)
    test=make_test(seed);review=make_review(seed+10000)
    write_json(out/"sample_student_retest.json",{"format":"mathmaster-content-spec/1","nativeImportVerified":False,"questions":public(test)})
    write_json(out/"sample_student_review.json",{"format":"mathmaster-content-spec/1","nativeImportVerified":False,"tasks":public(review)})
    write_json(out/"teacher_answer_keys.json",{"retest":test,"review":review})
    # Server/teacher fixture bank; classroom allocation is the engine's responsibility.
    write_json(out/"teacher_variant_bank.json",{"exposure":"teacher_server_only","nativeImportVerified":False,
               "forms":[{"formId":f"DOL2-{i+1:03}","referenceSeed":seed+i,"questions":make_test(seed+i)} for i in range(64)]})


if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--seed",type=int,default=104);p.add_argument("--out",default="generated")
    args=p.parse_args();generate(args.out,args.seed)

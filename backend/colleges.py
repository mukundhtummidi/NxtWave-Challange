"""Canonical list of common Indian engineering colleges + name normalization.

normalize_college(raw) -> (display_name, college_key)
- Matches aliases and fuzzy-matches against the canonical list so
  "Amrita Amaravati" and "amrita vishwa vidyapeetham amaravati" map to one key.
"""
import re
from difflib import SequenceMatcher

# (canonical name, [aliases])
_RAW = [
    # IITs
    ("IIT Bombay", ["iit mumbai", "indian institute of technology bombay"]),
    ("IIT Delhi", ["indian institute of technology delhi"]),
    ("IIT Madras", ["iit chennai", "indian institute of technology madras"]),
    ("IIT Kanpur", ["indian institute of technology kanpur"]),
    ("IIT Kharagpur", ["iit kgp", "indian institute of technology kharagpur"]),
    ("IIT Roorkee", []), ("IIT Guwahati", []), ("IIT Hyderabad", []), ("IIT (BHU) Varanasi", ["iit bhu", "iit varanasi"]),
    ("IIT Indore", []), ("IIT Ropar", []), ("IIT Gandhinagar", []), ("IIT Jodhpur", []), ("IIT Patna", []),
    ("IIT Bhubaneswar", []), ("IIT Mandi", []), ("IIT Tirupati", []), ("IIT Palakkad", []), ("IIT Dhanbad (ISM)", ["ism dhanbad", "iit ism"]),
    ("IIT Jammu", []), ("IIT Dharwad", []), ("IIT Bhilai", []), ("IIT Goa", []),
    # NITs
    ("NIT Trichy", ["nit tiruchirappalli", "nitt"]), ("NIT Surathkal", ["nitk", "nit karnataka"]), ("NIT Warangal", ["nitw"]),
    ("NIT Calicut", ["nitc"]), ("NIT Rourkela", []), ("NIT Kurukshetra", []), ("MNNIT Allahabad", ["nit allahabad", "mnnit"]),
    ("MNIT Jaipur", ["nit jaipur"]), ("VNIT Nagpur", ["nit nagpur"]), ("NIT Durgapur", []), ("NIT Silchar", []),
    ("NIT Hamirpur", []), ("NIT Jalandhar", ["dr b r ambedkar nit jalandhar"]), ("NIT Jamshedpur", []), ("NIT Patna", []),
    ("NIT Raipur", []), ("NIT Agartala", []), ("NIT Srinagar", []), ("NIT Meghalaya", []), ("NIT Goa", []),
    ("NIT Puducherry", []), ("NIT Delhi", []), ("NIT Uttarakhand", []), ("NIT Andhra Pradesh", ["nit tadepalligudem"]),
    ("NIT Manipur", []), ("NIT Mizoram", []), ("NIT Nagaland", []), ("NIT Arunachal Pradesh", []), ("NIT Sikkim", []),
    ("SVNIT Surat", ["nit surat"]), ("MANIT Bhopal", ["nit bhopal"]),
    # IIITs
    ("IIIT Hyderabad", ["iiit h", "iiith"]), ("IIIT Bangalore", ["iiit b", "iiitb"]), ("IIIT Allahabad", ["iiita"]),
    ("IIIT Delhi", ["iiitd"]), ("IIITDM Jabalpur", ["iiit jabalpur"]), ("IIITDM Kancheepuram", ["iiit kancheepuram", "iiitdm chennai"]),
    ("IIIT Gwalior (ABV-IIITM)", ["iiit gwalior", "iiitm gwalior"]), ("IIIT Sri City", []), ("IIIT Lucknow", []),
    ("IIIT Pune", []), ("IIIT Nagpur", []), ("IIIT Kota", []), ("IIIT Vadodara", []), ("IIIT Guwahati", []),
    ("IIIT Dharwad", []), ("IIIT Bhubaneswar", []), ("IIIT Kottayam", []), ("IIIT Una", []), ("IIIT Sonepat", []),
    ("IIIT Bhopal", []), ("IIIT Surat", []), ("IIIT Ranchi", []), ("IIIT Kalyani", []), ("IIIT Tiruchirappalli", []),
    # Other central / deemed
    ("BITS Pilani", ["bits pilani campus", "birla institute of technology and science pilani"]),
    ("BITS Pilani, Goa Campus", ["bits goa"]), ("BITS Pilani, Hyderabad Campus", ["bits hyderabad", "bits hyd"]),
    ("BIT Mesra", ["birla institute of technology mesra"]), ("DTU Delhi", ["delhi technological university", "dce"]),
    ("NSUT Delhi", ["netaji subhas university of technology", "nsit"]), ("IGDTUW Delhi", ["indira gandhi delhi technical university for women"]),
    ("Jamia Millia Islamia", ["jmi"]), ("Aligarh Muslim University (ZHCET)", ["amu", "zhcet"]), ("Jadavpur University", ["ju"]),
    ("IIEST Shibpur", ["besu", "bengal engineering"]), ("Anna University (CEG)", ["ceg", "college of engineering guindy", "anna university"]),
    ("MIT Campus, Anna University", ["madras institute of technology"]), ("PSG College of Technology", ["psg tech", "psg"]),
    ("Thiagarajar College of Engineering", ["tce madurai"]), ("Coimbatore Institute of Technology", ["cit coimbatore"]),
    ("Kumaraguru College of Technology", ["kct"]), ("SSN College of Engineering", ["ssn"]), ("Sri Sivasubramaniya Nadar", ["ssn chennai"]),
    ("VIT Vellore", ["vellore institute of technology", "vit"]), ("VIT Chennai", []), ("VIT-AP Amaravati", ["vit ap", "vit amaravati"]),
    ("VIT Bhopal", []), ("SRM Institute of Science and Technology, Kattankulathur", ["srm", "srm ktr", "srmist", "srm chennai"]),
    ("SRM University AP", ["srm ap", "srm amaravati"]), ("SASTRA University", ["sastra thanjavur"]),
    ("Amrita Vishwa Vidyapeetham, Coimbatore", ["amrita coimbatore", "amrita"]), ("Amrita Vishwa Vidyapeetham, Amritapuri", ["amrita amritapuri", "amrita kollam"]),
    ("Amrita Vishwa Vidyapeetham, Bengaluru", ["amrita bangalore", "amrita bengaluru"]), ("Amrita Vishwa Vidyapeetham, Amaravati", ["amrita amaravati", "amrita vishwa vidyapeetham amaravati"]),
    ("Amrita Vishwa Vidyapeetham, Chennai", ["amrita chennai"]),
    ("Manipal Institute of Technology", ["mit manipal", "manipal"]), ("Manipal Institute of Technology, Bengaluru", ["mit bangalore", "mit bengaluru"]),
    ("Thapar Institute of Engineering and Technology", ["thapar", "tiet patiala"]), ("Chandigarh University", ["cu"]),
    ("Lovely Professional University", ["lpu"]), ("Chitkara University", []), ("Punjab Engineering College", ["pec chandigarh"]),
    ("UIET Panjab University", ["uiet chandigarh"]), ("Guru Nanak Dev Engineering College, Ludhiana", ["gndec"]),
    ("Shiv Nadar University", ["snu"]), ("Bennett University", []), ("Amity University, Noida", ["amity noida"]),
    ("Jaypee Institute of Information Technology, Noida", ["jiit noida"]), ("Galgotias University", []), ("Sharda University", []),
    ("GL Bajaj Institute of Technology", ["gl bajaj"]), ("KIET Group of Institutions", ["kiet ghaziabad"]), ("ABES Engineering College", ["abes"]),
    ("Ajay Kumar Garg Engineering College", ["akgec"]), ("JSS Academy of Technical Education, Noida", ["jss noida"]),
    ("Graphic Era University", ["graphic era dehradun"]), ("DIT University", ["dit dehradun"]), ("UPES Dehradun", ["upes"]),
    ("MMMUT Gorakhpur", ["madan mohan malaviya university of technology"]), ("HBTU Kanpur", ["hbti kanpur", "harcourt butler"]),
    ("IET Lucknow", []), ("KNIT Sultanpur", []), ("BIET Jhansi", []), ("Dr. APJ Abdul Kalam Technical University", ["aktu"]),
    ("Jaypee University of Information Technology, Solan", ["juit"]), ("NIT Hamirpur (HP)", []),
    ("Delhi Skill and Entrepreneurship University", ["dseu"]), ("Maharaja Agrasen Institute of Technology", ["mait delhi"]),
    ("Maharaja Surajmal Institute of Technology", ["msit delhi"]), ("Bharati Vidyapeeth College of Engineering, Delhi", ["bvcoe delhi"]),
    ("Guru Tegh Bahadur Institute of Technology", ["gtbit"]), ("USICT, GGSIPU", ["usict", "ipu"]),
    # Rajasthan
    ("LNMIT Jaipur", ["lnm institute of information technology"]), ("Manipal University Jaipur", ["muj"]),
    ("Poornima College of Engineering", ["poornima jaipur"]), ("SKIT Jaipur", []), ("Banasthali Vidyapith", []), ("JECRC University", ["jecrc"]),
    ("MBM University Jodhpur", ["mbm jodhpur"]), ("RTU Kota", ["rajasthan technical university"]),
    # Gujarat / MP / Chhattisgarh
    ("DA-IICT Gandhinagar", ["daiict", "dhirubhai ambani"]), ("Nirma University", ["nirma ahmedabad", "institute of technology nirma"]),
    ("PDEU Gandhinagar", ["pdpu"]), ("LD College of Engineering", ["ldce ahmedabad"]), ("Charusat University", ["charusat"]),
    ("Ganpat University", []), ("Marwadi University", []), ("Parul University", []), ("GEC Gandhinagar", []),
    ("IET DAVV Indore", ["iet davv"]), ("SGSITS Indore", ["sgsits"]), ("Medicaps University", ["medi caps indore"]),
    ("Acropolis Institute of Technology", ["acropolis indore"]), ("LNCT Bhopal", []), ("Oriental Institute of Science and Technology", ["oist bhopal"]),
    ("UIT RGPV Bhopal", ["rgpv"]), ("Jabalpur Engineering College", ["jec jabalpur"]), ("Bhilai Institute of Technology", ["bit durg", "bit bhilai"]),
    ("Shri Shankaracharya Technical Campus", ["sstc bhilai"]), ("GEC Raipur", []),
    # Maharashtra
    ("COEP Technological University", ["coep", "college of engineering pune"]), ("VJTI Mumbai", ["vjti", "veermata jijabai"]),
    ("ICT Mumbai", ["institute of chemical technology", "udct"]), ("SPIT Mumbai", ["sardar patel institute of technology", "spit"]),
    ("Sardar Patel College of Engineering", ["spce mumbai"]), ("DJ Sanghvi College of Engineering", ["djsce", "dj sanghvi"]),
    ("KJ Somaiya College of Engineering", ["kjsce", "somaiya"]), ("Thadomal Shahani Engineering College", ["tsec mumbai"]),
    ("Fr. Conceicao Rodrigues College of Engineering", ["fr crce", "crce bandra"]), ("Vidyalankar Institute of Technology", ["vit mumbai"]),
    ("Thakur College of Engineering and Technology", ["tcet"]), ("Atharva College of Engineering", []), ("Rizvi College of Engineering", []),
    ("Don Bosco Institute of Technology, Mumbai", ["dbit mumbai"]), ("SIES Graduate School of Technology", ["sies gst"]),
    ("Pillai College of Engineering", ["pce panvel"]), ("Terna Engineering College", []), ("Datta Meghe College of Engineering", ["dmce"]),
    ("Ramrao Adik Institute of Technology", ["rait"]), ("Mukesh Patel School of Technology Management (NMIMS)", ["mpstme", "nmims"]),
    ("PICT Pune", ["pune institute of computer technology"]), ("VIT Pune", ["vishwakarma institute of technology"]),
    ("MIT World Peace University", ["mit wpu", "mitwpu"]), ("MIT Academy of Engineering, Alandi", ["mit aoe"]),
    ("Cummins College of Engineering for Women", ["cummins pune"]), ("PCCOE Pune", ["pimpri chinchwad college of engineering"]),
    ("AISSMS College of Engineering", ["aissms"]), ("Sinhgad College of Engineering", ["sinhgad"]), ("DY Patil College of Engineering, Pune", ["dypcoe"]),
    ("Symbiosis Institute of Technology", ["sit pune"]), ("Bharati Vidyapeeth College of Engineering, Pune", ["bvcoe pune"]),
    ("JSPM Rajarshi Shahu College of Engineering", ["rscoe"]), ("Army Institute of Technology", ["ait pune"]),
    ("Walchand College of Engineering, Sangli", ["wce sangli"]), ("Government College of Engineering, Aurangabad", ["geca"]),
    ("SGGS Nanded", []), ("Government College of Engineering, Amravati", ["gcoea"]), ("YCCE Nagpur", []), ("RCOEM Nagpur", ["shri ramdeobaba"]),
    ("GH Raisoni College of Engineering, Nagpur", ["ghrce"]), ("Dr. Babasaheb Ambedkar Technological University", ["dbatu lonere"]),
    ("KIT Kolhapur", []), ("DKTE Ichalkaranji", []), ("Sanjivani College of Engineering", []), ("Vishwakarma Institute of Information Technology", ["viit pune"]),
    # Karnataka
    ("RV College of Engineering", ["rvce"]), ("PES University", ["pesu", "pes"]), ("BMS College of Engineering", ["bmsce"]),
    ("MS Ramaiah Institute of Technology", ["msrit", "ramaiah"]), ("Dayananda Sagar College of Engineering", ["dsce"]),
    ("Bangalore Institute of Technology", ["bit bangalore"]), ("Sir M Visvesvaraya Institute of Technology", ["sir mvit"]),
    ("JSS Academy of Technical Education, Bengaluru", ["jssate bangalore"]), ("Nitte Meenakshi Institute of Technology", ["nmit"]),
    ("CMR Institute of Technology", ["cmrit"]), ("New Horizon College of Engineering", ["nhce"]), ("Reva University", []),
    ("Christ University", ["christ bangalore"]), ("Jain University", ["jain bangalore"]), ("Presidency University, Bengaluru", []),
    ("BNM Institute of Technology", ["bnmit"]), ("Global Academy of Technology", ["gat bangalore"]), ("Acharya Institute of Technology", []),
    ("Siddaganga Institute of Technology", ["sit tumkur"]), ("UVCE Bengaluru", ["university visvesvaraya college of engineering"]),
    ("NIE Mysuru", ["national institute of engineering mysore"]), ("SJCE Mysuru (JSS STU)", ["sjce", "jss science and technology university"]),
    ("Vidyavardhaka College of Engineering", ["vvce mysore"]), ("KLE Technological University", ["kle tech hubli", "bvb hubli"]),
    ("SDM College of Engineering", ["sdmcet dharwad"]), ("NMAM Institute of Technology", ["nmamit nitte"]), ("Sahyadri College of Engineering", []),
    ("St Joseph Engineering College", ["sjec mangalore"]), ("Canara Engineering College", []), ("BMS Institute of Technology", ["bmsit"]),
    ("Dr. Ambedkar Institute of Technology", ["dr ait bangalore"]), ("East Point College of Engineering", []), ("Atria Institute of Technology", []),
    ("RNS Institute of Technology", ["rnsit"]), ("SJB Institute of Technology", ["sjbit"]), ("KS Institute of Technology", ["ksit"]),
    ("Alliance University", []), ("Dayananda Sagar University", ["dsu"]), ("BGS Institute of Technology", []),
    # Telangana / Andhra
    ("JNTU Hyderabad (JNTUH)", ["jntuh", "jntu hyderabad"]), ("Osmania University College of Engineering", ["ouce", "osmania"]),
    ("CBIT Hyderabad", ["chaitanya bharathi institute of technology"]), ("VNR VJIET", ["vnrvjiet", "vnr vignana jyothi"]),
    ("Vasavi College of Engineering", ["vasavi"]), ("GRIET Hyderabad", ["gokaraju rangaraju"]), ("MGIT Hyderabad", ["mahatma gandhi institute of technology"]),
    ("CVR College of Engineering", ["cvr"]), ("Sreenidhi Institute of Science and Technology", ["snist", "sreenidhi"]),
    ("Keshav Memorial Institute of Technology", ["kmit"]), ("MVSR Engineering College", ["mvsr"]), ("Vardhaman College of Engineering", []),
    ("Anurag University", ["anurag hyderabad"]), ("Malla Reddy College of Engineering", ["mrce", "malla reddy"]), ("CMR College of Engineering, Hyderabad", ["cmrcet"]),
    ("Mahindra University", ["mahindra ecole centrale"]), ("ICFAI Tech Hyderabad", ["ifhe"]), ("KL University", ["klu", "koneru lakshmaiah", "kl deemed university"]),
    ("Andhra University College of Engineering", ["au college of engineering", "aucoe"]), ("JNTU Kakinada", ["jntuk"]), ("JNTU Anantapur", ["jntua"]),
    ("GITAM Visakhapatnam", ["gitam", "gitam vizag"]), ("GITAM Hyderabad", []), ("GVP College of Engineering", ["gvpce", "gayatri vidya parishad"]),
    ("ANITS Visakhapatnam", ["anil neerukonda"]), ("Vignan's Foundation for Science, Technology and Research", ["vignan", "vfstr"]),
    ("RVR & JC College of Engineering", ["rvrjc guntur"]), ("VR Siddhartha Engineering College", ["vrsec vijayawada"]), ("PVP Siddhartha Institute of Technology", ["pvpsit"]),
    ("Sri Venkateswara University College of Engineering", ["svuce tirupati"]), ("Sree Vidyanikethan Engineering College (MBU)", ["mohan babu university", "svec tirupati"]),
    ("Sri Venkateswara College of Engineering, Tirupati", ["svce tirupati"]), ("Aditya Engineering College", ["aditya surampalem"]),
    ("SRKR Engineering College", ["srkr bhimavaram"]), ("Vishnu Institute of Technology", ["vit bhimavaram"]), ("GMR Institute of Technology", ["gmrit"]),
    ("Raghu Engineering College", []), ("Pragati Engineering College", []), ("KITS Warangal", ["kakatiya institute of technology"]),
    ("NIT Warangal (NITW)", []), ("SR University", ["sr engineering college warangal"]), ("Chaitanya Deemed University", []),
    ("Narayana Engineering College", []), ("Lakireddy Bali Reddy College of Engineering", ["lbrce"]),
    # Tamil Nadu / Kerala
    ("Sri Venkateswara College of Engineering, Sriperumbudur", ["svce chennai", "svce"]), ("Rajalakshmi Engineering College", ["rec chennai"]),
    ("Saveetha Engineering College", []), ("St. Joseph's College of Engineering, Chennai", ["st josephs chennai"]), ("Panimalar Engineering College", []),
    ("Velammal Engineering College", []), ("RMK Engineering College", ["rmk"]), ("Easwari Engineering College", []), ("Meenakshi Sundararajan Engineering College", []),
    ("Sri Sairam Engineering College", ["sairam"]), ("Hindustan Institute of Technology and Science", ["hits chennai"]), ("Sathyabama Institute of Science and Technology", ["sathyabama"]),
    ("Loyola-ICAM College of Engineering", ["licet"]), ("Chennai Institute of Technology", ["cit chennai"]), ("Vel Tech University", ["vel tech"]),
    ("Government College of Technology, Coimbatore", ["gct coimbatore"]), ("Sri Krishna College of Engineering and Technology", ["skcet"]),
    ("Karunya Institute of Technology", ["karunya"]), ("Amrita School of Engineering Coimbatore", []), ("Bannari Amman Institute of Technology", ["bit sathy"]),
    ("Kongu Engineering College", ["kongu"]), ("Sri Ramakrishna Engineering College", ["srec coimbatore"]), ("Dr. Mahalingam College of Engineering", ["mcet pollachi"]),
    ("Kalasalingam Academy", ["kalasalingam"]), ("Mepco Schlenk Engineering College", ["mepco"]), ("National Engineering College, Kovilpatti", []),
    ("Government College of Engineering, Tirunelveli", ["gcet"]), ("Sona College of Technology", ["sona salem"]), ("K S Rangasamy College of Technology", ["ksrct"]),
    ("Kalaignar Karunanidhi Institute of Technology", ["kit coimbatore"]), ("Annamalai University", []), ("Pondicherry Engineering College (PTU)", ["pec puducherry", "ptu"]),
    ("Saranathan College of Engineering", []), ("Sri Eshwar College of Engineering", []),
    ("College of Engineering Trivandrum", ["cet trivandrum", "cet"]), ("TKM College of Engineering", ["tkmce kollam"]), ("NSS College of Engineering", ["nssce palakkad"]),
    ("Government Engineering College, Thrissur", ["gec thrissur"]), ("Model Engineering College", ["mec kochi", "mec"]), ("Rajagiri School of Engineering and Technology", ["rset"]),
    ("Mar Athanasius College of Engineering", ["mace kothamangalam"]), ("Federal Institute of Science and Technology", ["fisat"]), ("Saintgits College of Engineering", []),
    ("Cochin University (CUSAT SOE)", ["cusat"]), ("LBS Institute of Technology for Women", ["lbsitw"]), ("Mar Baselios College of Engineering", ["mbcet"]),
    ("Government Engineering College, Barton Hill", ["gec barton hill"]), ("Amal Jyothi College of Engineering", []), ("Muthoot Institute of Technology", ["mits kochi"]),
    ("Vidya Academy of Science and Technology", []), ("Jyothi Engineering College", []), ("Sahrdaya College of Engineering", []),
    # West Bengal / Odisha / Bihar / Jharkhand / NE
    ("Heritage Institute of Technology", ["heritage kolkata"]), ("Techno India University", ["techno main salt lake"]), ("Institute of Engineering and Management, Kolkata", ["iem kolkata"]),
    ("Narula Institute of Technology", []), ("Netaji Subhash Engineering College", ["nsec kolkata"]), ("Haldia Institute of Technology", ["hit haldia"]),
    ("Kalyani Government Engineering College", ["kgec"]), ("Jalpaiguri Government Engineering College", ["jgec"]), ("MAKAUT", ["wbut"]),
    ("Academy of Technology", ["aot hooghly"]), ("St. Thomas College of Engineering", []), ("University of Engineering and Management, Kolkata", ["uem kolkata"]),
    ("KIIT Bhubaneswar", ["kiit", "kalinga institute"]), ("SOA University (ITER)", ["iter", "siksha o anusandhan"]), ("CET Bhubaneswar", ["college of engineering and technology bhubaneswar"]),
    ("VSSUT Burla", ["vssut"]), ("Silicon Institute of Technology", ["silicon bhubaneswar"]), ("CV Raman Global University", ["cgu", "cv raman"]),
    ("GIET University", []), ("Trident Academy of Technology", []), ("IGIT Sarang", []),
    ("BIT Sindri", []), ("NIT Jamshedpur (NITJSR)", []), ("Birsa Institute of Technology", []), ("Sarala Birla University", []),
    ("MIT Muzaffarpur", []), ("BCE Bhagalpur", []), ("Darbhanga College of Engineering", []), ("Gaya College of Engineering", []), ("NIT Patna (NITP)", []),
    ("Assam Engineering College", ["aec guwahati"]), ("Jorhat Engineering College", []), ("Tezpur University", []), ("Girijananda Chowdhury University", []),
    ("Mizoram University", []), ("NERIST", []), ("Tripura Institute of Technology", []),
    # Others / North
    ("GGSIPU Delhi", []), ("Bhagwan Parshuram Institute of Technology", ["bpit"]), ("Dronacharya College of Engineering", []), ("ITM University Gwalior", []),
    ("Shri Mata Vaishno Devi University", ["smvdu"]), ("NIT Srinagar (NITSRI)", []), ("University of Jammu", []), ("IUST Awantipora", []),
    ("YMCA University (JC Bose)", ["ymca faridabad"]), ("DCRUST Murthal", []), ("NIT Kurukshetra (NITKKR)", []), ("Kurukshetra University (UIET)", ["uiet kuk"]),
    ("Ashoka University", []), ("OP Jindal Global University", []), ("Manav Rachna University", ["mru"]), ("The NorthCap University", ["ncu gurgaon"]),
    ("BML Munjal University", ["bmu"]), ("GD Goenka University", []), ("KR Mangalam University", []), ("Plaksha University", []),
    ("Guru Gobind Singh Indraprastha University", []), ("Rayat Bahra University", []), ("DAV Institute of Engineering and Technology, Jalandhar", ["daviet"]),
    ("Sant Longowal Institute of Engineering and Technology", ["sliet"]), ("Giani Zail Singh Campus College", ["gzsccet bathinda"]),
    ("Govind Ballabh Pant University", ["gbpuat pantnagar"]), ("Tula's Institute", []), ("Bipin Tripathi Kumaon Institute of Technology", ["btkit dwarahat"]),
    ("Kamla Nehru Institute of Technology", []), ("Rajkiya Engineering College, Kannauj", ["rec kannauj"]), ("Rajkiya Engineering College, Banda", ["rec banda"]),
    ("Bundelkhand Institute of Engineering and Technology", []), ("Invertis University", []), ("Integral University", []), ("BBD University", ["babu banarasi das"]),
    ("Pranveer Singh Institute of Technology", ["psit kanpur"]), ("United College of Engineering and Research", ["ucer allahabad"]), ("SRMCEM Lucknow", ["srm lucknow"]),
    ("Noida Institute of Engineering and Technology", ["niet greater noida"]), ("IMS Engineering College", ["imsec"]), ("Inderprastha Engineering College", ["ipec"]),
    ("Raj Kumar Goel Institute of Technology", ["rkgit"]), ("Meerut Institute of Engineering and Technology", ["miet meerut"]), ("Krishna Institute of Engineering", []),
    ("Hindustan College of Science and Technology", ["hcst mathura"]), ("GLA University", ["gla mathura"]), ("Sanskriti University", []), ("Teerthanker Mahaveer University", ["tmu"]),
    ("Moradabad Institute of Technology", []), ("IIMT University", []), ("Dr. Ram Manohar Lohia Avadh University", []), ("Shri Ramswaroop Memorial University", ["srmu"]),
    ("Goa College of Engineering", ["gec goa"]), ("Padre Conceicao College of Engineering", ["pcce goa"]), ("Don Bosco College of Engineering, Goa", []),
    ("BIT Patna", []), ("Amity University, Lucknow", []), ("Amity University, Gurugram", []), ("Amity University, Jaipur", []), ("Amity University, Mumbai", []),
    ("Christ University, Delhi NCR", []), ("Woxsen University", []), ("Mahindra University, Hyderabad", []), ("Atria University", []),
    ("MIT Art, Design and Technology University", ["mit adt pune"]), ("Ajeenkya DY Patil University", []), ("Flame University", []),
    ("Dr. Vishwanath Karad MIT WPU", []), ("Kalinga University", []), ("Shri Ramdeobaba College of Engineering", []),
]

_STOP = {"of", "the", "and", "for", "in", "at", "campus", "college", "institute", "university", "engineering", "technology", "science", "sciences", "&"}


def _norm(s: str) -> str:
    s = s.lower()
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _key(s: str) -> str:
    tokens = [t for t in _norm(s).split(" ") if t and t not in _STOP]
    return "-".join(tokens) or _norm(s).replace(" ", "-") or "unknown"


CANONICAL: list[str] = []
_ALIAS_TO_NAME: dict[str, str] = {}
_KEY_TO_NAME: dict[str, str] = {}

for _name, _aliases in _RAW:
    if _name in _KEY_TO_NAME.values():
        continue
    CANONICAL.append(_name)
    _KEY_TO_NAME[_key(_name)] = _name
    _ALIAS_TO_NAME[_norm(_name)] = _name
    for _a in _aliases:
        _ALIAS_TO_NAME[_norm(_a)] = _name
        _KEY_TO_NAME.setdefault(_key(_a), _name)

CANONICAL.sort(key=lambda x: x.lower())


def normalize_college(raw: str) -> tuple[str, str]:
    """Return (display_name, college_key). Falls back to a cleaned custom name."""
    cleaned = re.sub(r"\s+", " ", raw).strip()
    n = _norm(cleaned)
    if not n:
        return ("Unknown college", "unknown")
    if n in _ALIAS_TO_NAME:
        name = _ALIAS_TO_NAME[n]
        return (name, _key(name))
    k = _key(cleaned)
    if k in _KEY_TO_NAME:
        name = _KEY_TO_NAME[k]
        return (name, _key(name))
    # fuzzy: token-set overlap + sequence ratio against canonical keys
    tokens = set(k.split("-"))
    best, best_score = None, 0.0
    for ck, cname in _KEY_TO_NAME.items():
        ctokens = set(ck.split("-"))
        if not tokens or not ctokens:
            continue
        overlap = len(tokens & ctokens) / len(tokens | ctokens)
        ratio = SequenceMatcher(None, k, ck).ratio()
        score = max(overlap, ratio)
        if score > best_score:
            best, best_score = cname, score
    if best and best_score >= 0.86:
        return (best, _key(best))
    # custom college: Title-case display, normalized key
    display = " ".join(w if w.isupper() and len(w) <= 6 else w.capitalize() for w in cleaned.split(" "))
    return (display[:80], k[:80])

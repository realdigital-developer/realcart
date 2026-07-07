/**
 * Indian GST Tax Engine — Production-Level Multi-Vendor E-Commerce
 *
 * Implements comprehensive GST computation following Indian tax law:
 *   - CGST + SGST for intra-state supplies (same state)
 *   - IGST for inter-state supplies (different states)
 *   - HSN-based GST rate lookup with standard Indian GST slabs
 *   - Cess calculation for specific categories
 *   - Tax-inclusive vs tax-exclusive pricing support
 *   - Rounding to nearest rupee (Indian invoicing standard)
 *
 * Based on production systems used by Flipkart, Meesho, Amazon India.
 */

/* ------------------------------------------------------------------ */
/*  Indian GST Slabs                                                    */
/* ------------------------------------------------------------------ */

/** Standard Indian GST rate slabs */
export const GST_SLABS = [0, 0.25, 5, 12, 18, 28] as const
export type GstSlab = typeof GST_SLABS[number]

/** GST rate categories for product classification */
export interface GstRateInfo {
  /** GST rate as percentage (e.g., 18 for 18%) */
  rate: number
  /** Whether this is a nil-rated/exempt supply */
  isExempt: boolean
  /** Cess rate as percentage (e.g., 15 for luxury goods) */
  cessRate: number
  /** Human-readable description */
  description: string
  /** Common HSN codes for this rate */
  commonHsnCodes: string[]
}

/** Predefined GST rate configurations based on Indian tax law */
export const GST_RATES: Record<string, GstRateInfo> = {
  '0': {
    rate: 0,
    isExempt: true,
    cessRate: 0,
    description: 'Nil-rated / Exempt (fresh produce, books, etc.)',
    commonHsnCodes: ['0201', '0202', '0301', '4901', '4902', '4903'],
  },
  '0.25': {
    rate: 0.25,
    isExempt: false,
    cessRate: 0,
    description: 'Gold, silver, precious stones (0.25%)',
    commonHsnCodes: ['7108', '7109', '7113', '7114'],
  },
  '5': {
    rate: 5,
    isExempt: false,
    cessRate: 0,
    description: 'Essential items — clothing <₹1000, footwear <₹1000, packaged food, medicines',
    commonHsnCodes: ['3004', '6101', '6102', '6109', '6110', '6201', '6202', '6209', '6403', '6404', '2106', '1905'],
  },
  '12': {
    rate: 12,
    isExempt: false,
    cessRate: 0,
    description: 'Standard items — clothing ≥₹1000, footwear ≥₹1000, processed food, electronics accessories',
    commonHsnCodes: ['6103', '6104', '6105', '6106', '6111', '6203', '6204', '6205', '6206', '6401', '6402', '8544', '8523'],
  },
  '18': {
    rate: 18,
    isExempt: false,
    cessRate: 0,
    description: 'Most goods & services — electronics, cosmetics, software, telecom',
    commonHsnCodes: ['8517', '8528', '8525', '8471', '8470', '3304', '3401', '9503', '9504', '3926', '6911', '6912'],
  },
  '28': {
    rate: 28,
    isExempt: false,
    cessRate: 0,
    description: 'Luxury / Demerit goods — automobiles, cement, aerated drinks, tobacco',
    commonHsnCodes: ['8703', '2202', '2402', '2403', '2523', '7113', '9501', '9506'],
  },
  '28+cess': {
    rate: 28,
    isExempt: false,
    cessRate: 15,
    description: 'Luxury goods with cess — cars, sin goods, tobacco products',
    commonHsnCodes: ['8703', '2402', '2403'],
  },
}

/* ------------------------------------------------------------------ */
/*  HSN Code to GST Rate Mapping                                       */
/* ------------------------------------------------------------------ */

/**
 * Common HSN code prefix to GST rate mapping.
 * In production, this would be a full HSN master database.
 * This covers the most common e-commerce categories.
 */
export const HSN_GST_MAP: Record<string, number> = {
  // 0% — Exempt
  '0201': 0, '0202': 0, '0203': 0, '0204': 0, // Meat
  '0301': 0, '0302': 0, '0303': 0, // Fish
  '0401': 0, '0402': 0, '0403': 0, // Dairy (loose)
  '1001': 0, '1002': 0, '1003': 0, '1004': 0, '1005': 0, '1006': 0, // Cereals (loose)
  '4901': 0, '4902': 0, '4903': 0, // Books/Periodicals
  '5121': 0, // Raw silk

  // 5% — Essentials
  '0405': 5, // Butter/butter oil
  '0406': 5, // Cheese
  '0701': 5, '0702': 5, '0703': 5, // Vegetables (packed/frozen)
  '0801': 5, '0802': 5, '0803': 5, // Nuts/fruits (packed)
  '1101': 5, '1102': 5, '1103': 5, // Flour/malt
  '1905': 5, // Bread/bakery
  '2101': 5, '2102': 5, '2106': 5, // Food preparations
  '2202': 5, // Non-alcoholic beverages
  '2301': 5, // Animal feed
  '3004': 5, // Medicines
  '5105': 5, // Wool
  '5204': 5, '5205': 5, '5208': 5, '5209': 5, // Cotton
  '5407': 5, '5408': 5, // Woven fabrics
  '6001': 5, '6002': 5, // Knitted fabrics
  '6101': 5, '6102': 5, // Garments <₹1000
  '6109': 5, '6110': 5, // T-shirts/sweaters <₹1000
  '6201': 5, '6202': 5, // Garments <₹1000
  '6209': 5, // Baby garments
  '6302': 5, '6303': 5, '6304': 5, // Bed/table linen
  '6403': 5, '6404': 5, // Footwear <₹1000
  '6810': 5, // Cement products (prefab)
  '7308': 5, // Steel structures
  '7610': 5, // Aluminium structures
  '8211': 5, '8212': 5, // Knives/razors
  '8414': 5, '8415': 5, // AC/pumps
  '8418': 5, // Refrigerators
  '8421': 5, // Water purifiers
  '8422': 5, // Dish washing machines
  '8450': 5, // Washing machines
  '8516': 5, // Water heaters/geysers
  '9401': 5, // Seats/chairs
  '9403': 5, // Furniture

  // 12% — Standard
  '0504': 12, // Gut/bladders
  '0601': 12, // Live plants
  '0901': 12, '0902': 12, // Coffee/tea (packed)
  '1104': 12, '1105': 12, '1106': 12, // Cereal products
  '1602': 12, // Prepared meats
  '1704': 12, // Sugar confectionery
  '1806': 12, // Chocolate
  '1901': 12, '1902': 12, '1904': 12, // Malt/food prep/pasta
  '2001': 12, '2002': 12, '2003': 12, '2004': 12, '2005': 12, '2006': 12, '2007': 12, '2008': 12, '2009': 12, // Processed fruits/veg
  '2103': 12, '2104': 12, '2105': 12, // Sauces/soups/ice cream
  '2201': 12, // Waters (mineral)
  '2203': 12, '2204': 12, '2205': 12, '2206': 12, // Alcoholic beverages (malt)
  '2401': 12, // Unmanufactured tobacco
  '2523': 12, // Portland cement
  '2709': 12, '2710': 12, // Petroleum oils
  '2847': 12, // Hydrogen peroxide
  '3001': 12, '3002': 12, '3003': 12, // Pharma products
  '3101': 12, '3102': 12, '3103': 12, '3104': 12, '3105': 12, // Fertilisers
  '3204': 12, '3205': 12, '3206': 12, // Dyes/paints
  '3301': 12, '3302': 12, '3303': 12, '3304': 12, '3305': 12, // Cosmetics
  '3401': 12, '3402': 12, // Soap/cleaning
  '3923': 12, '3924': 12, '3926': 12, // Plastic articles
  '4015': 12, // Rubber gloves
  '4810': 12, '4811': 12, '4818': 12, '4819': 12, '4820': 12, // Paper products
  '5601': 12, // Wadding
  '5701': 12, '5702': 12, '5703': 12, // Carpets
  '6103': 12, '6104': 12, '6105': 12, '6106': 12, '6111': 12, // Garments ≥₹1000
  '6203': 12, '6204': 12, '6205': 12, '6206': 12, // Garments ≥₹1000
  '6211': 12, '6212': 12, '6214': 12, // Garments
  '6301': 12, '6305': 12, '6306': 12, // Blankets/tents
  '6401': 12, '6402': 12, // Footwear ≥₹1000
  '6501': 12, '6504': 12, '6505': 12, // Headgear
  '6507': 12, // Headgear
  '6601': 12, // Umbrellas
  '6610': 12, // Umbrella parts
  '6911': 12, '6912': 12, // Ceramic tableware
  '6913': 12, '6914': 12, // Ceramic articles
  '7013': 12, // Glassware
  '7117': 12, // Imitation jewellery
  '7323': 12, '7324': 12, // Steel articles
  '7418': 12, // Copper articles
  '7615': 12, // Aluminium articles
  '8201': 12, '8202': 12, '8203': 12, '8204': 12, '8205': 12, // Hand tools
  '8207': 12, // Interchangeable tools
  '8215': 12, // Spoons/forks
  '8301': 12, '8302': 12, // Padlocks/hinges
  '8419': 12, // Machinery
  '8423': 12, // Weighing machinery
  '8443': 12, // Printing machinery
  '8451': 12, '8452': 12, // Laundry/sewing machinery
  '8463': 12, // Metal processing
  '8470': 12, // Calculating machines
  '8472': 12, // Office machines
  '8481': 12, // Taps/valves
  '8482': 12, // Ball bearings
  '8504': 12, // Transformers
  '8509': 12, // Electro-mechanical domestic appliances
  '8510': 12, // Shavers/hair clippers
  '8513': 12, // Portable lamps
  '8523': 12, // Discs/tapes/solid-state storage
  '8525': 12, // Cameras
  '8528': 12, // Monitors/projectors
  '8529': 12, // Parts for electronics
  '8531': 12, // Electric sound/visual signalling
  '8536': 12, // Electrical apparatus
  '8540': 12, // Thermionic valves/tubes
  '8541': 12, // Diodes/transistors
  '8542': 12, // Electronic integrated circuits
  '8543': 12, // Electrical machines
  '8544': 12, // Insulated wire/cable
  '8708': 12, // Motor vehicle parts
  '8711': 12, // Motorcycles
  '8712': 12, // Bicycles
  '8714': 12, // Bicycle parts
  '9004': 12, // Spectacles
  '9101': 12, '9102': 12, // Watches/clocks
  '9405': 12, // Lamps/lighting
  '9503': 12, '9504': 12, // Toys/games
  '9505': 12, // Festive articles
  '9506': 12, // Sports equipment
  '9608': 12, // Pens/pencils

  // 18% — Most goods & services
  '1301': 18, // Lac/gums
  '2207': 18, // Undenatured ethyl alcohol
  '2309': 18, // Pet food
  '2402': 18, // Cigars/cigarettes (without cess)
  '2403': 18, // Smoking tobacco (without cess)
  '2601': 18, '2602': 18, // Iron ores
  '2701': 18, '2702': 18, // Coal
  '2818': 18, // Aluminium oxide
  '2842': 18, // Salts
  '2905': 18, // Acyclic alcohols
  '2936': 18, // Provitamins/vitamins
  '2941': 18, // Antibiotics
  '3005': 18, // Wadding/gauze/dressings
  '3208': 18, '3209': 18, // Paints/varnishes
  '3214': 18, // Glaziers putty
  '3306': 18, // Oral/dental hygiene
  '3307': 18, // Shaving/deodorants
  '3403': 18, // Lubricants
  '3405': 18, // Polishes/creams
  '3506': 18, // Prepared glues
  '3605': 18, // Matches
  '3814': 18, // Organic composite solvents
  '3824': 18, // Prepared binders
  '3901': 18, '3902': 18, '3903': 18, '3904': 18, '3907': 18, '3908': 18, // Polymers
  '4002': 18, '4005': 18, '4006': 18, // Rubber
  '4011': 18, // New pneumatic tyres
  '4012': 18, // Retreaded tyres
  '4013': 18, // Inner tubes
  '4014': 18, // Hygienic/medical rubber
  '4104': 18, '4105': 18, '4106': 18, '4107': 18, // Leather
  '4201': 18, '4202': 18, '4203': 18, // Leather articles/bags
  '4205': 18, // Leather crafts
  '4302': 18, '4303': 18, // Furskin articles
  '4304': 18, // Artificial fur
  '4410': 18, '4411': 18, '4412': 18, // Wood panels
  '4414': 18, // Wooden frames
  '4418': 18, // Builders wood
  '4421': 18, // Wooden articles
  '4602': 18, // Plaiting/basketwork
  '4701': 18, '4702': 18, '4703': 18, '4704': 18, '4705': 18, // Wood pulp
  '4801': 18, '4802': 18, '4804': 18, '4805': 18, // Paper
  '4821': 18, // Paper labels
  '4905': 18, // Maps/charts
  '4906': 18, // Plans/drawings
  '4907': 18, // Unused stamps
  '5107': 18, // Yarn of combed wool
  '5111': 18, '5112': 18, // Woven wool fabrics
  '5204': 18, '5205': 18, '5206': 18, '5207': 18, '5208': 18, '5209': 18, '5210': 18, '5211': 18, '5212': 18, // Cotton
  '5309': 18, '5310': 18, '5311': 18, // Flax/hemp
  '5401': 18, '5402': 18, '5403': 18, '5404': 18, '5405': 18, '5406': 18, '5407': 18, '5408': 18, // Man-made filaments
  '5501': 18, '5502': 18, '5503': 18, '5504': 18, '5505': 18, '5506': 18, '5507': 18, '5508': 18, '5509': 18, '5510': 18, '5511': 18, '5512': 18, '5513': 18, '5514': 18, '5515': 18, '5516': 18, // Man-made staple fibres
  '5602': 18, '5603': 18, '5604': 18, '5605': 18, '5606': 18, '5607': 18, '5608': 18, '5609': 18, // Wadding/yarn/rope
  '5801': 18, '5802': 18, '5803': 18, '5804': 18, '5805': 18, '5806': 18, '5807': 18, // Special woven fabrics
  '5901': 18, '5902': 18, '5903': 18, '5905': 18, '5906': 18, '5907': 18, '5908': 18, // Impregnated textiles
  '6003': 18, '6004': 18, '6005': 18, '6006': 18, // Knitted fabrics
  '6112': 18, '6113': 18, '6114': 18, '6115': 18, '6116': 18, '6117': 18, // Garments
  '6213': 18, '6215': 18, '6216': 18, '6217': 18, // Garments
  '6307': 18, '6308': 18, '6309': 18, // Made-up articles
  '6506': 18, // Headgear (safety)
  '6602': 18, // Walking sticks/whips
  '6603': 18, // Umbrella/walking stick parts
  '6604': 18, // Walking stick fittings
  '6605': 18, // Garden umbrellas
  '6606': 18, // Umbrella frames
  '6607': 18, // Umbrella covers
  '6608': 18, // Umbrella fittings
  '6609': 18, // Walking stick fittings
  '6811': 18, // Asbestos cement
  '6812': 18, // Fabricated asbestos
  '6813': 18, // Friction material
  '6814': 18, // Worked mica
  '6815': 18, // Other mineral articles
  '6904': 18, // Bricks/blocks
  '6905': 18, // Roofing tiles
  '6906': 18, // Drain pipes
  '6907': 18, '6908': 18, // Ceramic tiles
  '7003': 18, '7004': 18, '7005': 18, '7006': 18, // Glass
  '7007': 18, // Safety glass
  '7008': 18, // Multiple-walled insulating units
  '7009': 18, // Glass mirrors
  '7010': 18, // Carboys/bottles
  '7011': 18, // Glass envelopes
  '7014': 18, // Signal glass
  '7015': 18, // Clock/watch glass
  '7016': 18, // Paving blocks
  '7017': 18, // Lab glassware
  '7018': 18, // Glass beads
  '7019': 18, // Glass fibres
  '7020': 18, // Other glass articles
  '7112': 18, // Precious metal waste
  '7115': 18, // Other precious metal articles
  '7118': 18, // Coin
  '7210': 18, '7211': 18, '7212': 18, '7213': 18, '7214': 18, '7215': 18, '7216': 18, '7217': 18, // Iron/steel
  '7218': 18, '7219': 18, '7220': 18, '7221': 18, '7222': 18, '7223': 18, '7224': 18, '7225': 18, '7226': 18, '7227': 18, '7228': 18, '7229': 18, // Stainless steel
  '7301': 18, '7302': 18, '7303': 18, '7304': 18, '7305': 18, '7306': 18, '7307': 18, // Iron/steel products
  '7310': 18, '7311': 18, '7312': 18, '7313': 18, '7314': 18, '7315': 18, '7316': 18, '7317': 18, '7318': 18, '7319': 18, '7320': 18, '7321': 18, '7322': 18, '7325': 18, '7326': 18, // Iron/steel articles
  '7407': 18, '7408': 18, '7409': 18, '7410': 18, '7411': 18, '7412': 18, '7413': 18, '7415': 18, '7416': 18, // Copper
  '7419': 18, // Copper articles
  '7507': 18, '7508': 18, // Nickel
  '7604': 18, '7605': 18, '7606': 18, '7607': 18, '7608': 18, '7609': 18, '7611': 18, '7612': 18, '7613': 18, '7614': 18, '7616': 18, // Aluminium
  '7806': 18, // Lead articles
  '7907': 18, // Zinc articles
  '8007': 18, // Tin articles
  '8101': 18, '8102': 18, '8103': 18, '8104': 18, '8105': 18, '8106': 18, '8107': 18, '8108': 18, '8109': 18, '8110': 18, '8111': 18, '8112': 18, '8113': 18, // Other base metals
  '8206': 18, // Tools of two/more metals
  '8208': 18, // Knives/cutting blades
  '8209': 18, // Interchangeable tool plates
  '8213': 18, // Scissors/tailors shears
  '8214': 18, // Other articles of cutlery
  '8216': 18, // Spoons/forks/ladles
  '8303': 18, '8304': 18, '8305': 18, '8306': 18, '8307': 18, '8308': 18, '8309': 18, '8310': 18, // Base metal articles
  '8401': 18, '8402': 18, '8403': 18, '8404': 18, '8405': 18, '8406': 18, '8407': 18, '8408': 18, '8409': 18, '8410': 18, '8411': 18, '8412': 18, '8413': 18, '8415': 18, '8416': 18, '8417': 18, '8420': 18, '8424': 18, '8425': 18, '8426': 18, '8427': 18, '8428': 18, '8429': 18, '8430': 18, '8431': 18, '8432': 18, '8433': 18, '8434': 18, '8435': 18, '8436': 18, '8437': 18, '8438': 18, '8439': 18, '8440': 18, '8441': 18, '8442': 18, '8444': 18, '8445': 18, '8446': 18, '8447': 18, '8448': 18, '8449': 18, '8453': 18, '8454': 18, '8455': 18, '8456': 18, '8457': 18, '8458': 18, '8459': 18, '8460': 18, '8461': 18, '8462': 18, '8464': 18, '8465': 18, '8466': 18, '8467': 18, '8468': 18, '8469': 18, // Machinery
  '8471': 18, // Computers/data processing
  '8473': 18, // Parts of office machines
  '8474': 18, '8475': 18, '8476': 18, '8477': 18, '8478': 18, '8479': 18, // Machinery
  '8480': 18, // Moulding boxes
  '8483': 18, '8484': 18, '8485': 18, // Transmission shafts/gaskets
  '8486': 18, // Machines for manufacture of semiconductor devices
  '8487': 18, // Machinery parts
  '8491': 18, '8492': 18, '8493': 18, '8494': 18, '8495': 18, '8496': 18, '8497': 18, '8498': 18, '8499': 18, // Engines/motors
  '8501': 18, '8502': 18, '8503': 18, '8505': 18, '8506': 18, '8507': 18, '8508': 18, '8511': 18, '8512': 18, '8514': 18, '8515': 18, '8517': 18, // Electrical equipment/phones
  '8518': 18, '8519': 18, '8520': 18, '8521': 18, '8522': 18, // Audio/video equipment
  '8524': 18, '8526': 18, '8527': 18, // Flat panel displays/radar/radio
  '8530': 18, '8532': 18, '8533': 18, '8534': 18, '8535': 18, '8537': 18, '8538': 18, '8539': 18, '8543': 18, '8545': 18, '8546': 18, '8547': 18, '8548': 18, '8549': 18, // Electrical components
  '8601': 18, '8602': 18, '8603': 18, '8604': 18, '8605': 18, '8606': 18, '8607': 18, '8608': 18, '8609': 18, // Railway
  '8701': 18, '8702': 18, '8703': 18, '8704': 18, '8705': 18, '8706': 18, '8707': 18, '8709': 18, // Vehicles
  '8710': 18, '8713': 18, '8714': 18, '8715': 18, '8716': 18, // Trailers/caravans
  '8720': 18, '8721': 18, '8722': 18, '8723': 18, '8724': 18, '8725': 18, // Other vehicles
  '8801': 18, '8802': 18, '8803': 18, '8804': 18, '8805': 18, '8806': 18, '8807': 18, // Aircraft
  '8901': 18, '8902': 18, '8903': 18, '8904': 18, '8905': 18, '8906': 18, '8907': 18, '8908': 18, // Ships/boats
  '9001': 18, '9002': 18, '9003': 18, '9005': 18, '9006': 18, '9007': 18, // Optical/photographic
  '9008': 18, '9010': 18, '9011': 18, '9012': 18, '9013': 18, '9014': 18, '9015': 18, // Optical instruments
  '9016': 18, '9017': 18, '9018': 18, '9019': 18, '9020': 18, '9021': 18, '9022': 18, '9023': 18, '9024': 18, '9025': 18, '9026': 18, '9027': 18, '9028': 18, '9029': 18, '9030': 18, '9031': 18, '9032': 18, '9033': 18, // Measuring/medical instruments
  '9103': 18, '9104': 18, '9105': 18, '9106': 18, '9107': 18, '9108': 18, '9109': 18, '9110': 18, '9111': 18, '9112': 18, '9113': 18, '9114': 18, // Clocks/watches
  '9201': 18, '9202': 18, '9205': 18, '9206': 18, '9207': 18, '9208': 18, '9209': 18, '9210': 18, '9211': 18, '9212': 18, '9213': 18, // Musical instruments
  '9301': 18, '9302': 18, '9303': 18, '9304': 18, '9305': 18, '9306': 18, '9307': 18, // Arms/ammunition
  '9406': 18, // Prefabricated buildings
  '9507': 18, // Fishing equipment
  '9508': 18, // Fairground equipment
  '9601': 18, '9602': 18, '9603': 18, '9604': 18, '9605': 18, '9606': 18, '9607': 18, // Worked ivory/bone
  '9609': 18, // Pencils/crayons
  '9610': 18, '9611': 18, '9612': 18, '9613': 18, '9614': 18, '9615': 18, '9616': 18, '9617': 18, '9618': 18, // Miscellaneous manufactured
  '9701': 18, '9702': 18, '9703': 18, '9704': 18, '9705': 18, '9706': 18, // Art/collectors pieces

  // 28% — Luxury/Demerit
  '8703': 28, // Motor cars/vehicles
  '8711': 28, // Motorcycles > 350cc
  '2710': 28, // Petroleum oils (some categories)
  '3304': 28, // Cosmetics (some categories)
  '7113': 28, // Jewellery
  '6305': 28, // Aerated drinks (some categories)
}

/* ------------------------------------------------------------------ */
/*  Indian State Codes & Names                                          */
/* ------------------------------------------------------------------ */

export const INDIAN_STATES: Record<string, string> = {
  'AN': 'Andaman and Nicobar Islands',
  'AP': 'Andhra Pradesh',
  'AR': 'Arunachal Pradesh',
  'AS': 'Assam',
  'BR': 'Bihar',
  'CH': 'Chandigarh',
  'CT': 'Chhattisgarh',
  'DD': 'Daman and Diu',
  'DL': 'Delhi',
  'DN': 'Dadra and Nagar Haveli',
  'GA': 'Goa',
  'GJ': 'Gujarat',
  'HP': 'Himachal Pradesh',
  'HR': 'Haryana',
  'JH': 'Jharkhand',
  'JK': 'Jammu and Kashmir',
  'KA': 'Karnataka',
  'KL': 'Kerala',
  'LA': 'Ladakh',
  'LD': 'Lakshadweep',
  'MH': 'Maharashtra',
  'ML': 'Meghalaya',
  'MN': 'Manipur',
  'MP': 'Madhya Pradesh',
  'MZ': 'Mizoram',
  'NL': 'Nagaland',
  'OD': 'Odisha',
  'PB': 'Punjab',
  'PY': 'Puducherry',
  'RJ': 'Rajasthan',
  'SK': 'Sikkim',
  'TG': 'Telangana',
  'TN': 'Tamil Nadu',
  'TR': 'Tripura',
  'UK': 'Uttarakhand',
  'UP': 'Uttar Pradesh',
  'WB': 'West Bengal',
}

/** Get state code from GSTIN (first 2 digits) */
export function getStateFromGstin(gstin: string): string | null {
  if (!gstin || gstin.length < 2) return null
  const stateCode = gstin.substring(0, 2)
  // Map numeric state codes to alphabetic codes
  const numericToAlpha: Record<string, string> = {
    '01': 'JK', '02': 'HP', '03': 'PB', '04': 'CH', '05': 'UK',
    '06': 'HR', '07': 'DL', '08': 'RJ', '09': 'UP', '10': 'BR',
    '11': 'SK', '12': 'AR', '13': 'NL', '14': 'MN', '15': 'MZ',
    '16': 'TR', '17': 'ML', '18': 'AS', '19': 'WB', '20': 'JH',
    '21': 'OD', '22': 'CT', '23': 'MP', '24': 'GJ', '25': 'DD',
    '26': 'DN', '27': 'MH', '28': 'AP', '29': 'KA', '30': 'GA',
    '31': 'LD', '32': 'KL', '33': 'TN', '34': 'PY', '35': 'AN',
    '36': 'TG', '37': 'LA',
  }
  return numericToAlpha[stateCode] || null
}

/* ------------------------------------------------------------------ */
/*  Tax Calculation Types                                               */
/* ------------------------------------------------------------------ */

/** Input parameters for tax calculation */
export interface TaxCalculationInput {
  /** HSN code of the product */
  hsnCode: string
  /** GST rate override (if set on product, takes priority over HSN lookup) */
  gstRate?: number
  /** Selling price (effective price after discount) */
  sellingPrice: number
  /** Whether the selling price is tax-inclusive */
  isTaxInclusive: boolean
  /** Seller's state code (e.g., 'MH') */
  sellerState: string
  /** Customer's shipping state code (e.g., 'KA') */
  customerState: string
  /** Cess rate override (%) */
  cessRate?: number
}

/** Tax breakdown result */
export interface TaxBreakdown {
  /** Taxable value (base amount before tax) */
  taxableValue: number
  /** Total GST amount */
  gstAmount: number
  /** CGST amount (for intra-state) */
  cgst: number
  /** SGST amount (for intra-state) */
  sgst: number
  /** IGST amount (for inter-state) */
  igst: number
  /** Cess amount */
  cessAmount: number
  /** Applied GST rate (%) */
  gstRate: number
  /** Whether this is intra-state (CGST+SGST) or inter-state (IGST) */
  isIntraState: boolean
  /** Total tax amount (GST + Cess) */
  totalTax: number
  /** Final price including all taxes */
  priceWithTax: number
}

/** Order-level tax summary */
export interface OrderTaxSummary {
  /** Total taxable value across all items */
  totalTaxableValue: number
  /** Total CGST */
  totalCgst: number
  /** Total SGST */
  totalSgst: number
  /** Total IGST */
  totalIgst: number
  /** Total Cess */
  totalCess: number
  /** Total tax amount */
  totalTax: number
  /** Round-off adjustment (to nearest rupee) */
  roundOff: number
  /** Whether intra-state supply */
  isIntraState: boolean
  /** Tax details per item */
  itemTaxDetails: Array<{
    orderItemId: string
    hsnCode: string
    gstRate: number
    taxableValue: number
    cgst: number
    sgst: number
    igst: number
    cessAmount: number
    totalTax: number
  }>
}

/* ------------------------------------------------------------------ */
/*  Core Tax Calculation Functions                                      */
/* ------------------------------------------------------------------ */

/**
 * Look up GST rate from HSN code.
 * Falls back to 18% if HSN code not found (most common rate).
 */
export function lookupGstRate(hsnCode: string): number {
  if (!hsnCode) return 18 // Default to 18% if no HSN code

  // Try exact 4-digit match first
  const hsn4 = hsnCode.replace(/\s/g, '').substring(0, 4)
  if (HSN_GST_MAP[hsn4] !== undefined) {
    return HSN_GST_MAP[hsn4]
  }

  // Try 2-digit prefix match
  const hsn2 = hsnCode.substring(0, 2)
  for (const [key, rate] of Object.entries(HSN_GST_MAP)) {
    if (key.startsWith(hsn2) && key.length === 4) {
      return rate // Use first match at 2-digit level
    }
  }

  return 18 // Default to 18% (most common rate for e-commerce)
}

/**
 * Determine if a supply is intra-state or inter-state.
 * Intra-state: Both seller and customer are in the same state → CGST + SGST
 * Inter-state: Different states → IGST
 */
export function isIntraStateSupply(sellerState: string, customerState: string): boolean {
  if (!sellerState || !customerState) return false // Default to inter-state if unknown
  return sellerState.toUpperCase() === customerState.toUpperCase()
}

/**
 * Calculate tax breakdown for a single item.
 *
 * This is the core function that computes CGST/SGST/IGST based on:
 * 1. GST rate (from product or HSN lookup)
 * 2. Whether supply is intra-state or inter-state
 * 3. Whether the price is tax-inclusive or tax-exclusive
 * 4. Cess rate if applicable
 *
 * @param input - Tax calculation parameters
 * @returns Complete tax breakdown
 */
export function calculateTax(input: TaxCalculationInput): TaxBreakdown {
  const {
    hsnCode,
    gstRate: gstRateOverride,
    sellingPrice,
    isTaxInclusive,
    sellerState,
    customerState,
    cessRate: cessRateOverride,
  } = input

  // 1. Determine GST rate: product-level override > HSN lookup > default 18%
  const gstRate = gstRateOverride !== undefined && gstRateOverride >= 0
    ? gstRateOverride
    : lookupGstRate(hsnCode)

  // 2. Determine cess rate
  const cessRate = cessRateOverride || 0

  // 3. Determine supply type
  const isIntraState = isIntraStateSupply(sellerState, customerState)

  // 4. Calculate taxable value and tax amounts
  let taxableValue: number
  let gstAmount: number
  let cessAmount: number

  if (isTaxInclusive) {
    // Price includes tax — extract taxable value
    // Formula: taxableValue = sellingPrice × (100 / (100 + gstRate + cessRate))
    const divisor = 100 + gstRate + cessRate
    taxableValue = Math.round((sellingPrice * 100 / divisor) * 100) / 100
    gstAmount = Math.round((taxableValue * gstRate / 100) * 100) / 100
    cessAmount = Math.round((taxableValue * cessRate / 100) * 100) / 100
  } else {
    // Price excludes tax — add tax on top
    taxableValue = sellingPrice
    gstAmount = Math.round((taxableValue * gstRate / 100) * 100) / 100
    cessAmount = Math.round((taxableValue * cessRate / 100) * 100) / 100
  }

  // 5. Split GST into CGST+SGST or IGST
  let cgst = 0
  let sgst = 0
  let igst = 0

  if (isIntraState) {
    // Intra-state: CGST + SGST (each = half of GST rate)
    cgst = Math.round((gstAmount / 2) * 100) / 100
    sgst = Math.round((gstAmount / 2) * 100) / 100
  } else {
    // Inter-state: IGST (full GST rate)
    igst = gstAmount
  }

  // 6. Total tax
  const totalTax = gstAmount + cessAmount

  // 7. Price with tax
  const priceWithTax = Math.round(taxableValue + totalTax)

  return {
    taxableValue,
    gstAmount,
    cgst,
    sgst,
    igst,
    cessAmount,
    gstRate,
    isIntraState,
    totalTax,
    priceWithTax,
  }
}

/**
 * Calculate tax breakdown for multiple quantities of the same item.
 */
export function calculateTaxForQuantity(
  input: TaxCalculationInput,
  quantity: number,
): TaxBreakdown & { quantity: number } {
  const perUnitTax = calculateTax(input)

  return {
    taxableValue: Math.round(perUnitTax.taxableValue * quantity * 100) / 100,
    gstAmount: Math.round(perUnitTax.gstAmount * quantity * 100) / 100,
    cgst: Math.round(perUnitTax.cgst * quantity * 100) / 100,
    sgst: Math.round(perUnitTax.sgst * quantity * 100) / 100,
    igst: Math.round(perUnitTax.igst * quantity * 100) / 100,
    cessAmount: Math.round(perUnitTax.cessAmount * quantity * 100) / 100,
    gstRate: perUnitTax.gstRate,
    isIntraState: perUnitTax.isIntraState,
    totalTax: Math.round(perUnitTax.totalTax * quantity * 100) / 100,
    priceWithTax: Math.round(perUnitTax.priceWithTax * quantity),
    quantity,
  }
}

/**
 * Calculate order-level tax summary with rounding.
 * Indian invoices must round the final total to the nearest rupee.
 */
export function calculateOrderTaxSummary(
  items: Array<{
    orderItemId: string
    hsnCode: string
    gstRate: number
    taxableValue: number
    cgst: number
    sgst: number
    igst: number
    cessAmount: number
    totalTax: number
  }>,
): OrderTaxSummary {
  let totalTaxableValue = 0
  let totalCgst = 0
  let totalSgst = 0
  let totalIgst = 0
  let totalCess = 0
  let totalTax = 0

  const isIntraState = items.length > 0 ? items[0].cgst > 0 || items[0].sgst > 0 : false

  for (const item of items) {
    totalTaxableValue += item.taxableValue
    totalCgst += item.cgst
    totalSgst += item.sgst
    totalIgst += item.igst
    totalCess += item.cessAmount
    totalTax += item.totalTax
  }

  // Round each component to 2 decimal places
  totalTaxableValue = Math.round(totalTaxableValue * 100) / 100
  totalCgst = Math.round(totalCgst * 100) / 100
  totalSgst = Math.round(totalSgst * 100) / 100
  totalIgst = Math.round(totalIgst * 100) / 100
  totalCess = Math.round(totalCess * 100) / 100
  totalTax = Math.round(totalTax * 100) / 100

  // Calculate round-off (difference between exact total and rounded rupee)
  const exactTotal = totalTaxableValue + totalTax
  const roundedTotal = Math.round(exactTotal)
  const roundOff = Math.round((roundedTotal - exactTotal) * 100) / 100

  return {
    totalTaxableValue,
    totalCgst,
    totalSgst,
    totalIgst,
    totalCess,
    totalTax,
    roundOff,
    isIntraState,
    itemTaxDetails: items,
  }
}

/**
 * Round a number to the nearest rupee (Indian invoicing standard).
 */
export function roundToRupee(amount: number): number {
  return Math.round(amount)
}

/**
 * Standard GST rate applied on delivery charges under Indian GST rules.
 * Delivery (transport of goods by road via GTA) attracts 18% GST under
 * Forward Charge Mechanism (or 5% under RCM with input restrictions).
 * This project uses 18% FCM — the rate the customer typically sees on
 * e-commerce invoices from Flipkart / Amazon / Meesho.
 */
export const DELIVERY_GST_RATE = 18

/**
 * Extract the GST portion from a GST-inclusive delivery charge.
 *
 * WHY THIS EXISTS:
 *   This project treats the customer-facing `deliveryCharge` as GST-INCLUSIVE
 *   (the customer pays `items + deliveryCharge`, no separate GST line). For
 *   internal tax reporting (GSTR-1, seller payouts, finance summaries) we
 *   still need to know how much of that inclusive charge is GST vs taxable
 *   value. This helper extracts the embedded GST using the standard
 *   reverse-GST formula: `gst = inclusive × rate / (100 + rate)`.
 *
 * EXAMPLE:
 *   - Inclusive delivery charge = ₹49, rate = 18%
 *   - Embedded GST  = 49 × 18 / 118 = ₹7.47
 *   - Taxable value = 49 − 7.47    = ₹41.53
 *
 * The returned value is rounded to 2 decimal places (paise precision) to
 * match the rest of the finance/order calculations in this project.
 */
export function extractGstFromInclusiveCharge(
  inclusiveAmount: number,
  rate: number = DELIVERY_GST_RATE,
): number {
  if (!inclusiveAmount || inclusiveAmount <= 0 || !rate || rate <= 0) return 0
  return Math.round((inclusiveAmount * rate) / (100 + rate) * 100) / 100
}

/**
 * Validate a GSTIN (Goods and Services Tax Identification Number).
 * Format: 2-digit state code + 10-digit PAN + 1-digit entity + 1-digit check + 'Z' + 1-digit check
 */
export function validateGstin(gstin: string): { valid: boolean; error?: string } {
  if (!gstin) return { valid: false, error: 'GSTIN is required' }

  const cleaned = gstin.trim().toUpperCase()

  if (cleaned.length !== 15) {
    return { valid: false, error: 'GSTIN must be 15 characters' }
  }

  // Check format: NN[A-Z]{5}\d{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}
  const gstinRegex = /^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/
  if (!gstinRegex.test(cleaned)) {
    return { valid: false, error: 'Invalid GSTIN format' }
  }

  return { valid: true }
}

/**
 * Validate an Indian PAN (Permanent Account Number).
 * Format: 5 letters + 4 digits + 1 letter
 */
export function validatePan(pan: string): { valid: boolean; error?: string } {
  if (!pan) return { valid: false, error: 'PAN is required' }

  const cleaned = pan.trim().toUpperCase()
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/

  if (!panRegex.test(cleaned)) {
    return { valid: false, error: 'Invalid PAN format (e.g., ABCDE1234F)' }
  }

  return { valid: true }
}

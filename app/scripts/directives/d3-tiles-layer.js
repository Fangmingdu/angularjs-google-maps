/**
 * extend d3.geo.tile
 *
 * */
d3.geo.tile = function() {
    var zoom = 10,
        sw = [0,0], //lat,lng
        ne = [0,0]; //lat,lng

    function long2tile(lon,zoom) {
        return (Math.floor((lon+180)/360*Math.pow(2,zoom)));
    }

    function lat2tile(lat,zoom)  {
        return (Math.floor((1-Math.log(Math.tan(lat*Math.PI/180) + 1/Math.cos(lat*Math.PI/180))/Math.PI)/2 *Math.pow(2,zoom)));
    }

    function tile() {
        var k = 256,
            sw_origin = [long2tile(sw.lng(),zoom), lat2tile(sw.lat(),zoom)],
            ne_origin = [long2tile(ne.lng(),zoom), lat2tile(ne.lat(),zoom)],
            tiles = [],
            cols = d3.range(sw_origin[0], ne_origin[0]+1),
            rows = d3.range(ne_origin[1], sw_origin[1]+1);

        rows.forEach(function(y) {
            cols.forEach(function(x) {
                tiles.push([x, y, zoom]);
            });
        });

        tiles.scale = k;
        tiles.translate = [sw_origin[0],ne_origin[1]];

        return tiles;
    }

    tile.zoom = function(_) {
        if (!arguments.length) return zoom;
        zoom = _;
        return tile;
    };

    tile.sw = function(_) {
        if (!arguments.length) return sw;
        sw = _;
        return tile;
    };

    tile.ne = function(_) {
        if (!arguments.length) return ne;
        ne = _;
        return tile;
    };

    return tile;
};
/**
 * @ngdoc directive
 * @name d3-tiles-layer
 * @requires Attr2Options
 * @description
 *   Requires:  map directive
 *   Restrict To:  Element
 *
 * @example
 * Example:
 *
 *   <map zoom="11" center="[41.875696,-87.624207]">
 *     <d3-tiles-layer></d3-tiles-layer>
 *   </map>
 */
/*jshint -W089*/
ngMap.directive('d3TilesLayer', ['Attr2Options', '$window',  function(Attr2Options, $window) {
    var parser = Attr2Options;

    TileOverlay.prototype = new google.maps.OverlayView();

    function getQuardKey(x,y,z){
        var quadKey = [];
        for (var i = z; i > 0; i--) {
            var digit = '0';
            var mask = 1 << (i - 1);
            if ((x & mask) != 0) {
                digit++;
            }
            if ((y & mask) != 0) {
                digit++;
                digit++;
            }
            quadKey.push(digit);
        }
        return quadKey.join('');
    };

    /** @constructor */
    function TileOverlay(controller,options,currentScope) {

        // Initialize all properties.
        this.controller = controller;
        this.id = options.id;
        this.options = options;

        var scope = currentScope;
        this.getScope = function(){
            return scope;
        };

        // Define translate property
        this.translate_x = 0;
        this.translate_y = 0;
    }

    /**
     * onAdd is called when the map's panes are ready and the overlay has been
     * added to the map.
     */
    TileOverlay.prototype.onAdd = function() {
        // svg layer
        var overlaysvg = d3.select(this.getPanes().overlayLayer)
            .append("svg")
            .style("width", $window.innerWidth + "px")
            .style("height", $window.innerHeight + "px")
            .style('position','absolute');

        //current private variable
        var options = this.options,
            overlayProjection = this.getProjection(),
            markers_map = {},
            sizeMap = {10:0.2,11:0.3,12:0.4,13:0.6,14:0.7,15:0.8,16:1,17:1,18:1,19:1},
            currentQuardKeys = [];

        var scope = this.getScope();

        //d3 related variable
        var tile = d3.geo.tile(),  // geo tile object
            tilePath = d3.geo.path().projection(googleMapProjection); //d3 path function

        /**
         * Turn the overlay projection into a d3 projection
         *
         * */
        function googleMapProjection(coordinates) {
            var googleCoordinates = new google.maps.LatLng(coordinates[1], coordinates[0]);
            var pixelCoordinates = overlayProjection.fromLatLngToDivPixel(googleCoordinates);
            return [pixelCoordinates.x, pixelCoordinates.y];
        };

        /**
         * clear all markers in map
         *
         * */
        function clearMarkers(map,groupId){
            if(Object.keys(markers_map).length > 0){
                if(groupId){
                    if(groupId in markers_map)
                    {
                        markers_map[groupId].forEach(function (d) {
                            var marker = map.markers[d];
                            if(marker){
                                delete map.markers[d];
                                marker.setMap(null);
                            }
                        });
                    }
                    delete markers_map[groupId];
                }
                else{
                    for(var groupId in markers_map)
                    {
                        markers_map[groupId].forEach(function (d) {
                            var marker = map.markers[d];
                            if(marker){
                                delete map.markers[d];
                                marker.setMap(null);
                            }
                        });
                    }

                    //empty map
                    markers_map = {};
                }
            }
        }
        /**
         *
         * */
        function getMarkerIcon(map,url,currentMarkerConfig){
            var width = currentMarkerConfig.iconwidth,
                height = currentMarkerConfig.iconheight;

            var image = {
                url: currentMarkerConfig.path + url,
                // This marker is 20 pixels wide by 32 pixels tall.  32, 37
                scaledSize: new google.maps.Size(width*sizeMap[map.getZoom()], height*sizeMap[map.getZoom()])
            };

            return image;
        }

        function getOccName(occid){
            //0,1,5 -> stablized,  3,4 -> lease_up, 2->uc, 6 -> planned
            if(occid === 0 || occid === 1 || occid===5 || occid === 20 || occid ===21 || occid === 25){
                return 'Stabilized';
            }
            else if(occid === 3 || occid ===4 || occid === 23 || occid === 24){
                return 'Lease Up';
            }
            else if(occid === 2 || occid === 22){
                return 'Under Construction';
            }
            else if(occid === 6 || occid === 26){
                return 'Planned';
            }
            else if(occid === 8) {
                return 'In Progress';
            };
        };

        /**
         *
         *
         * */
        function loadMarkers(map,controller,groupId,json,config){

            var markeroptions = {},
                markersids = [],
                currentMarkerConfig = options.markeroptions[config.id];

            if(! (groupId in markers_map)){
                markers_map[groupId] = [];
            };

            json.features.filter(function(d){return d.geometry.type === 'Point';})
                .forEach(function(d){

                    var currentId = d.properties[currentMarkerConfig.id];
                    if(markers_map[groupId].indexOf(currentId) === -1){
                        markers_map[groupId].push(currentId);
                        markersids.push(currentId);

                        markeroptions.position = new google.maps.LatLng(d.geometry.coordinates[1], d.geometry.coordinates[0]);
                        markeroptions.id = currentId;
                        markeroptions.icon = getMarkerIcon(map,d.properties.picon,currentMarkerConfig); //pcion is the icon field from the properties
                        markeroptions.markerType = config.id;

                        //load data to markers object
                        d.properties.lat = d.geometry.coordinates[1];
                        d.properties.lng = d.geometry.coordinates[0];
                        d.properties.occname = getOccName(d.properties.occid);
                        markeroptions.data = d.properties;
                        markeroptions.highlightable = (d.properties.occid !== 8);

                        var marker = new google.maps.Marker(markeroptions);
                        if(config.tooltip){

                            google.maps.event.addListener(marker, 'mouseover', function(ev){

                                // no events emit for unvisible markers
                                if(marker.getOpacity() === 0){
                                    return;
                                };
                                scope.$emit('markerMouseover', {position: overlayProjection.fromLatLngToContainerPixel(ev.latLng), latLng: ev.latLng, marker: marker, type: config.id });
                            });

                            google.maps.event.addListener(marker, 'mouseout', function(ev){

                                // no events emit for unvisible markers
                                if(marker.getOpacity() === 0){
                                    return;
                                };

                                scope.$emit('markerMouseout',{position: overlayProjection.fromLatLngToContainerPixel(ev.latLng), latLng: ev.latLng, marker: marker, type: config.id });
                            });
                        };

                        google.maps.event.addListener(marker, 'click', function () {

                            // no events emit for unvisible markers
                            if(marker.getOpacity() === 0){
                                return;
                            };

                            scope.$emit('markerClicked',{data: d.properties,marker:marker});
                        });

                        google.maps.event.addListener(marker,'rightclick',function(e){

                            // no events emit for unvisible markers
                            if(marker.getOpacity() === 0){
                                return;
                            };

                            scope.$emit('markerRightClicked', {position: overlayProjection.fromLatLngToContainerPixel(e.latLng), latLng: e.latLng, id: d.properties[currentMarkerConfig.id], type: config.id, data: d.properties });
                        });

                        controller.addMarker(marker);

                    };

                });

            scope.$emit('markersLoaded', {id:config.id,markers:markersids});
        }

        /**
         * load feature from topoJson or geoJson
         * to svg
         * or google markers
         *
         * */
        function loadFeatures(map,controller,svg,json,groupId,config){
            //load polygons
            //svg.selectAll("path")
            //    .data(json.features.filter(function(d){return d.geometry.type === 'Polygon';}))
            //    .enter().append("path")
            //    .attr("class", function(d) { return d.properties.kind; })
            //    .attr("d", tilePath);

            loadMarkers(map,controller,groupId,json,config);
        };

        /**
        *
        * */
        function forceRemove(element,selector){
            element.selectAll(selector).
                each(function(d){
                    if(this._xhr && this._xhr.length > 0){
                        this._xhr.forEach(function(e){
                            e.abort();
                        });

                        this._xhr = [];
                    };
                });

            element.selectAll(selector).remove();
        };

        function getVisible() {
            var visible = false;
            options.tileoptions.urls.forEach(function(elem,index) {
                if(elem.visible){
                    visible = true;
                };
            });

            return visible;
        };


        /**
         * re draw function
         * getting current tiles
         * request data
         * call load feature functions
         *
         * */
        function reDraw(map,controller,translate_x,translate_y,force_redraw){
            //current tiles
            var tiles = tile
                .zoom(map.getZoom())
                .sw(map.getBounds().getSouthWest())
                .ne(map.getBounds().getNorthEast())();

            if(force_redraw){
                forceRemove(overlaysvg,"g.tile");//overlaysvg.selectAll("g.tile").remove();
            };
            //selection
            var image = overlaysvg.selectAll("g.tile").data(tiles, function(d) {
                return d;
            });

            //tiles exit and remove data
            image.exit().each(function(d) {

                if(this._xhr && this._xhr.length > 0){
                    this._xhr.forEach(function(e){
                        e.abort();
                    });

                    this._xhr = [];
                };

                var groupId = d[0] + '-' + d[1] + '-' + d[2];

                clearMarkers(map,groupId);

            }).remove();

            if(!getVisible()){
                return;
            };

            scope.$emit('tiles.loaded.len', { len: image.data().length - image.data().filter(function (d) { return !angular.isUndefined(d) }).length });

            image.enter().append("g").attr("class", "tile").each(function(d) {
                var group = d3.select(this),
                    tempXHR = [];
                if(!this._xhr){
                    this._xhr = [];
                };

                options.tileoptions.urls.forEach(function(elem,index){
                    if(map.getZoom() >= elem.zoom && elem.visible){
                        var url = elem.url + d[2] + "/" + d[0] + "/" + d[1] + '?pa=' + elem.pipeline;// + ".json";

                        var xhr = d3.json(url, function(error, json) {
                            if(error || json === undefined){
                                if(error.status === 401) {
                                    scope.$emit('unauthorized',{});
                                }
                                else{
                                    scope.$emit('markersLoaded', {});
                                };
                            }
                            else{
                                //load features
                                loadFeatures(map,controller,group,json,d[0]+'-'+d[1]+'-'+d[2],elem);
                            };
                        }).on("beforesend", function (request) {request.withCredentials = true;});

                        tempXHR.push(xhr);
                    };
                });

                if(tempXHR.length > 0){
                    this._xhr = tempXHR;
                }
                else{
                    this._xhr = [];
                };

            });

            image.attr("transform", "translate(" + translate_x + "," + translate_y + ")");
        }

        TileOverlay.prototype.clearMarkers = function(map) {
            //clear all markers
            if(map){
                clearMarkers(map);
            };
        };

        TileOverlay.prototype.draw = function(foreceRedraw) {
            //re draw tiles
            reDraw(this.map,this.controller,this.translate_x,this.translate_y,!!foreceRedraw);
        };

        TileOverlay.prototype.dragged = function() {
            //get current moved x y coordinates
            this.translate_x = -Math.round(this.getProjection().fromLatLngToDivPixel(this.map.getBounds().getSouthWest()).x);
            this.translate_y = -Math.round(this.getProjection().fromLatLngToDivPixel(this.map.getBounds().getNorthEast()).y);

            //move svg element
            overlaysvg.style('left', -this.translate_x + 'px').style('top', -this.translate_y + 'px');

            //re draw all tiles
            reDraw(this.map,this.controller,this.translate_x,this.translate_y);

        };

        TileOverlay.prototype.project = function(latLng){
            return overlayProjection.fromLatLngToContainerPixel(latLng);
        };

        TileOverlay.prototype.toggleLayer = function(map,visibleLayers){

            clearMarkers(map);

            options.tileoptions.urls.forEach(function(elem) {
                if (visibleLayers.indexOf(elem.id) !== -1) {
                    elem.visible = true;
                }
                else {
                    elem.visible = false;
                };
            });

            reDraw(map,this.controller,this.translate_x,this.translate_y,true);
        };

        TileOverlay.prototype.slideTime = function(map,time){

            clearMarkers(map);

            options.tileoptions.urls.forEach(function(elem) {
                elem.url = elem.url.replace(/([0-9]+-)+[0-9]+/g,time);
            });

            reDraw(map,this.controller,this.translate_x,this.translate_y,true);
        };

    };

    /**
     * change requested property history time
     * */
    TileOverlay.prototype.setTime = function(time){
        this.options.tileoptions.urls.forEach(function(elem) {
            elem.url = elem.url.replace(/([0-9]+-)+[0-9]+/g,time);
        });
    };

    /**
     * add vector tiles access domain
     * */
    TileOverlay.prototype.setUrlDomain = function(domain){
        this.options.tileoptions.urls.forEach(function(elem) {
            elem.url = domain + elem.url;
        });
    };

    /**
     * setVisibleLayer is used to initilize map with different visible layer
     *
     * */
    TileOverlay.prototype.setVisibleLayer = function(layerIds) {

        this.options.tileoptions.urls.forEach(function(elem) {
            if (layerIds.indexOf(elem.id) !== -1) {
                elem.visible = true;
            }
            else {
                elem.visible = false;
            };
        });
    };

    /**
     * set pipeline access in url parameter
     *
     * */
    TileOverlay.prototype.setPipelineAccess = function(access) {

        this.options.tileoptions.urls.forEach(function(elem) {
            elem.pipeline = access[elem.id];
        });
    };

    return {
        restrict: 'E',
        require: '^map',

        link: function(scope, element, attrs, mapController) {
            var orgAttrs = parser.orgAttributes(element);
            var filtered = parser.filter(attrs);
            var options = parser.getOptions(filtered);
            var controlOptions = parser.getControlOptions(filtered);
            var events = parser.getEvents(scope, filtered);

            console.log("filtered", filtered, "options", options, 'controlOptions', controlOptions, 'events', events);
            /**
             * set options
             */

            var overlay = new TileOverlay(mapController,options,scope);
            /**
             * set events
             */


            mapController.addObject('d3TilesLayers', overlay);
        }
    }; // return
}]);